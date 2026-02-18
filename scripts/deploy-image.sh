#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
ok() {
	echo -e "${GREEN}✓ $1${NC}"
}

error() {
	echo -e "${RED}✗ $1${NC}"
}

warn() {
	echo -e "${YELLOW}⚠ $1${NC}"
}

info() {
	echo -e "${BLUE}ℹ $1${NC}"
}

abort() {
	error "$1"
	exit 1
}

# Usage function
usage() {
	cat <<-EOF

	Usage: $0 [options...]

	Options:
	  -e            Environment: stage | prod (required)
	  -h            Show usage

	Examples:
	  # Deploy to staging
	  $0 -e stage

	  # Deploy to production
	  $0 -e prod

	This script will:
	  1. Read the version from the latest git tag
	     - prod:  latest tag matching X.Y.Z       (e.g., 1.1.1)
	     - stage: latest tag matching staging-X.Y.Z (e.g., staging-1.2.0 → 1.2.0)
	  2. Update the .env file with the resolved version
	  3. Build and push the Docker image to AWS ECR

	Create tags before deploying:
	  git tag 1.1.1          && git push origin 1.1.1          # prod
	  git tag staging-1.2.0  && git push origin staging-1.2.0  # staging

EOF
	exit 0
}

# Parse command line arguments
ENVIRONMENT=""
while getopts "e:h" opt; do
	case $opt in
		e)
			ENVIRONMENT="$OPTARG"
			;;
		h)
			usage
			;;
		\?)
			echo "Invalid option: -$OPTARG" >&2
			usage
			;;
	esac
done

# Validate environment parameter
if [ -z "$ENVIRONMENT" ]; then
	error "Environment parameter is required"
	usage
fi

# Normalize environment to lowercase
ENVIRONMENT=$(echo "$ENVIRONMENT" | tr '[:upper:]' '[:lower:]')

# Validate environment value
if [ "$ENVIRONMENT" != "stage" ] && [ "$ENVIRONMENT" != "prod" ]; then
	abort "Invalid environment: $ENVIRONMENT. Use 'stage' or 'prod'"
fi

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
	abort ".env file not found at $ENV_FILE"
fi

# Determine config based on environment
if [ "$ENVIRONMENT" == "stage" ]; then
	VERSION_VAR="IMG_VERSION_STAGING"
	REPOSITORY="trino-doc-worker-staging"
	TAG_PATTERN="staging-[0-9]*.[0-9]*.[0-9]*"
	ENV_LABEL="staging"
else
	VERSION_VAR="IMG_VERSION_PROD"
	REPOSITORY="trino-doc-worker"
	TAG_PATTERN="[0-9]*.[0-9]*.[0-9]*"
	ENV_LABEL="production"
fi

info "Environment: $ENV_LABEL"
info "Repository: $REPOSITORY"

# Read version from latest git tag
info "Reading version from latest git tag ($TAG_PATTERN)..."

if [ "$ENVIRONMENT" == "stage" ]; then
	GIT_TAG=$(git tag --sort=version:refname --list "$TAG_PATTERN" | tail -1)
	if [ -z "$GIT_TAG" ]; then
		abort "No staging git tag found. Create one first: git tag staging-X.Y.Z && git push origin staging-X.Y.Z"
	fi
	NEW_VERSION="${GIT_TAG#staging-}"
	info "Git tag found: $GIT_TAG"
else
	GIT_TAG=$(git tag --sort=version:refname --list "$TAG_PATTERN" | tail -1)
	if [ -z "$GIT_TAG" ]; then
		abort "No production git tag found. Create one first: git tag X.Y.Z && git push origin X.Y.Z"
	fi
	NEW_VERSION="$GIT_TAG"
	info "Git tag found: $GIT_TAG"
fi

info "Image version: $NEW_VERSION"

# Validate resolved version format (should be X.Y.Z)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
	abort "Invalid version format resolved: $NEW_VERSION. Expected format: X.Y.Z (e.g., 1.0.4)"
fi

# Confirm before proceeding
echo ""
warn "This will:"
echo "  1. Update ${VERSION_VAR}=${NEW_VERSION} in .env"
echo "  2. Build and push Docker image: ${REPOSITORY}:${NEW_VERSION}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
	info "Aborted by user"
	exit 0
fi

# Update .env file
info "Updating .env file..."

TEMP_ENV=$(mktemp)
trap "rm -f $TEMP_ENV" EXIT

if sed "s/^${VERSION_VAR}=.*/${VERSION_VAR}=${NEW_VERSION}/" "$ENV_FILE" > "$TEMP_ENV"; then
	mv "$TEMP_ENV" "$ENV_FILE"
	ok ".env file updated successfully"
else
	abort "Failed to update .env file"
fi

# Execute the image-aws.sh script
info "Building and pushing Docker image..."
echo ""

cd "$PROJECT_ROOT"
"$SCRIPT_DIR/image-aws.sh" -m aws -v "$NEW_VERSION" -r "$REPOSITORY"

if [ $? -eq 0 ]; then
	echo ""
	ok "Deployment completed successfully!"
	info "Version ${NEW_VERSION} has been built and pushed to ${REPOSITORY}"
	info "Updated ${VERSION_VAR}=${NEW_VERSION} in .env"
else
	error "Failed to build and push Docker image"
	warn "Note: The .env file has been updated, but the build failed."
	warn "You may want to revert ${VERSION_VAR} in .env"
	exit 1
fi
