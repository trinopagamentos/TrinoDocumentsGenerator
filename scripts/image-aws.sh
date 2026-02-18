#!/bin/bash

# Exit on any error
set -e

# Usage function
usage() {
	cat <<-EOF

	Usage: $0 [options...]

	Options:
	  -v            Version tag (default: latest)
	  -r            Repository name (default: trino-core)
	  -g            AWS region (default: us-east-1)
	  -p            AWS profile (default: trino)
	  -a            AWS account ID (default: 841162676072)
	  -m            Platform mode: aws (x86_64) | multi (x86_64 + arm64) (default: aws)
	  -h            Show usage

	Examples:
	  # Production build
	  $0 -v 1.0.0 -r trino-core

	  # Staging build
	  $0 -v 0.2.0 -r trino-core-staging

	  # Multi-platform build
	  $0 -v 1.0.0 -m multi

EOF
	exit 0
}

# Go to current directory
CURR_FOLDER="$(pwd)"
cd $CURR_FOLDER

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

abort() {
	error "$1"
	exit 1
}

# Parse command line arguments
while getopts "v:r:g:p:a:m:h" opt; do
	case $opt in
		v)
			VERSION="$OPTARG"
			;;
		r)
			REPOSITORY="$OPTARG"
			;;
		g)
			AWS_REGION="$OPTARG"
			;;
		p)
			AWS_PROFILE="$OPTARG"
			;;
		a)
			AWS_ACCOUNT_ID="$OPTARG"
			;;
		m)
			PLATFORM_MODE="$OPTARG"
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

# Variables with defaults
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-trino}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-841162676072}"
REPOSITORY="${REPOSITORY:-trino-core}"
VERSION="${VERSION:-latest}"
PLATFORM_MODE="${PLATFORM_MODE:-aws}"

# Set platform based on mode
case $PLATFORM_MODE in
	aws)
		PLATFORM="linux/x86_64"
		;;
	multi)
		PLATFORM="linux/amd64,linux/arm64"
		;;
	*)
		abort "Invalid platform mode: $PLATFORM_MODE. Use 'aws' or 'multi'"
		;;
esac

# ECR registry URL
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TAG_IMAGE="${ECR_REGISTRY}/${REPOSITORY}:${VERSION}"
TAG_IMAGE_LATEST="${ECR_REGISTRY}/${REPOSITORY}:latest"

echo "Building and pushing Docker image to AWS ECR..."
echo "AWS Account: ${AWS_ACCOUNT_ID}"
echo "AWS Region: ${AWS_REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "Repository: ${REPOSITORY}"
echo "Version: ${VERSION}"
echo "Platform mode: ${PLATFORM_MODE} (${PLATFORM})"
echo "Tags: ${TAG_IMAGE}, ${TAG_IMAGE_LATEST}"
echo ""

# Validate AWS CLI is installed
if ! command -v aws &> /dev/null; then
	abort "AWS CLI is not installed. Please install it first: https://aws.amazon.com/cli/"
fi
ok "AWS CLI is installed"

# Validate Docker is running
if ! docker info > /dev/null 2>&1; then
	abort "Docker is not running. Please start Docker first."
fi
ok "Docker is running"

# Authenticate to ECR
echo "Authenticating to ECR..."
aws ecr get-login-password --profile $AWS_PROFILE --region $AWS_REGION | \
	docker login --username AWS --password-stdin $ECR_REGISTRY > /dev/null 2>&1
test $? -ne 0 && abort "Failed to authenticate to ECR registry --> ${ECR_REGISTRY}" || ok "ECR authentication successful"

# Check if repository exists, create if it doesn't
echo "Checking if ECR repository exists..."
REPO_EXISTS=$(aws ecr describe-repositories \
	--profile $AWS_PROFILE \
	--region $AWS_REGION \
	--repository-names $REPOSITORY \
	2>&1 | grep -c "repositoryName" || true)

if [ "$REPO_EXISTS" -eq "0" ]; then
	warn "Repository ${REPOSITORY} does not exist. Creating..."

	# Create repository
	aws ecr create-repository \
		--profile $AWS_PROFILE \
		--region $AWS_REGION \
		--repository-name $REPOSITORY \
		--image-scanning-configuration scanOnPush=true \
		> /dev/null 2>&1

	test $? -ne 0 && abort "Failed to create ECR repository --> ${REPOSITORY}" || ok "Repository created successfully"

	# Set lifecycle policy
	echo "Setting lifecycle policy (keep last 5 images)..."
	LIFECYCLE_POLICY='{
		"rules": [
			{
				"rulePriority": 1,
				"description": "Delete untagged images after 7 days",
				"selection": {
					"tagStatus": "untagged",
					"countType": "sinceImagePushed",
					"countUnit": "days",
					"countNumber": 7
				},
				"action": {
					"type": "expire"
				}
			},
			{
				"rulePriority": 2,
				"description": "Keep last 5 images",
				"selection": {
					"tagStatus": "any",
					"countType": "imageCountMoreThan",
					"countNumber": 5
				},
				"action": {
					"type": "expire"
				}
			}
		]
	}'

	LIFECYCLE_ERROR=$(aws ecr put-lifecycle-policy \
		--profile $AWS_PROFILE \
		--region $AWS_REGION \
		--repository-name $REPOSITORY \
		--lifecycle-policy-text "$LIFECYCLE_POLICY" \
		2>&1 > /dev/null)

	if [ $? -ne 0 ]; then
		warn "Failed to set lifecycle policy: $LIFECYCLE_ERROR"
	else
		ok "Lifecycle policy configured"
	fi
else
	ok "Repository ${REPOSITORY} exists"
fi

# Create and use buildx builder for multi-platform builds
echo "Setting up buildx builder for multi-platform builds..."
docker buildx create --name multiplatform-builder --use --bootstrap > /dev/null 2>&1 || true
docker buildx use multiplatform-builder > /dev/null 2>&1 || abort "Failed to setup buildx builder"
ok "Buildx builder configured"

# Build and push the image
echo "Building Docker image..."
docker buildx build \
	--platform $PLATFORM \
	--build-arg VERSION=${VERSION} \
	--compress \
	--tag $TAG_IMAGE \
	--tag $TAG_IMAGE_LATEST \
	--push \
	.

test $? -ne 0 && abort "Failed to build and push image --> ${TAG_IMAGE}" || ok "Build and push completed --> ${TAG_IMAGE}"

echo ""
ok "Image successfully pushed to ECR!"
echo "Image: ${TAG_IMAGE}"
echo "Latest: ${TAG_IMAGE_LATEST}"
echo ""
echo "To use this image in your sst.config.ts, set:"
echo "  image: '${TAG_IMAGE}'"
