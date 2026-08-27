"""Cloudflare R2 adapter (S3-compatible) for the analyze-run job."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cratedig_engine.job import JobSettings


class R2Store:
    def __init__(self, client: Any):
        self.client = client

    @classmethod
    def from_settings(cls, settings: JobSettings) -> R2Store:
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for analyze-run; install cratedig-engine[job]"
            ) from exc
        client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
        return cls(client)

    def download(self, bucket: str, object_key: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(bucket, object_key, str(dest))
        return dest

    def upload_bytes(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        *,
        content_type: str,
    ) -> None:
        self.client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )
