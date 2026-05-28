"""
Cosmos DB client factory with verbose connection diagnostics.
"""
from __future__ import annotations

import logging
import os
import traceback
from typing import Any, Literal, Optional

from azure.cosmos import CosmosClient, exceptions as cosmos_exceptions
from azure.identity import DefaultAzureCredential
from fastapi import HTTPException

from .config import (
    COSMOSDB_CONNECTION_STRING,
    COSMOSDB_ENDPOINT,
    COSMOSDB_KEY,
    DATABASE_NAME,
    DOTENV_LOADED,
    ENV_FILE,
)
from .models import FeedbackDocument

logger = logging.getLogger(__name__)

AuthMode = Literal["connection_string", "account_key", "default_azure_credential"]

# Env names we accept (prod may use COSMOS_DB_* vs COSMOSDB_*).
ENV_ENDPOINT = ("COSMOSDB_ENDPOINT", "COSMOS_DB_ENDPOINT")
ENV_KEY = ("COSMOSDB_KEY", "COSMOS_DB_KEY")
ENV_CONNECTION_STRING = ("COSMOSDB_CONNECTION_STRING", "COSMOS_DB_CONNECTION_STRING")
ENV_DATABASE = ("COSMOSDB_DATABASE", "DATABASE_NAME", "COSMOS_DATABASE_NAME")


def _strip_env(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.strip().strip('"').strip("'")


def _mask_secret(value: Optional[str]) -> str:
    if not value:
        return "<not set>"
    if len(value) <= 8:
        return f"<set, len={len(value)}>"
    return f"{value[:4]}...{value[-4:]} (len={len(value)})"


def _env_status(names: tuple[str, ...]) -> dict[str, str]:
    """Log-friendly map of env var -> unset | set (masked for secrets)."""
    out: dict[str, str] = {}
    for name in names:
        raw = os.getenv(name)
        if not raw:
            out[name] = "unset"
        elif "KEY" in name or "CONNECTION_STRING" in name or "PASSWORD" in name:
            out[name] = f"set ({_mask_secret(_strip_env(raw))})"
        else:
            out[name] = f"set ({_strip_env(raw)})"
    return out


def _resolve_from_env(names: tuple[str, ...]) -> tuple[Optional[str], Optional[str]]:
    for name in names:
        raw = os.getenv(name)
        if raw is not None and str(raw).strip() != "":
            return _strip_env(raw), name
    return None, None


def describe_cosmos_config() -> dict[str, Any]:
    """Snapshot of effective Cosmos settings and which env vars were found."""
    endpoint_env, endpoint_source = _resolve_from_env(ENV_ENDPOINT)
    key_env, key_source = _resolve_from_env(ENV_KEY)
    conn_env, conn_source = _resolve_from_env(ENV_CONNECTION_STRING)
    db_env, db_source = _resolve_from_env(ENV_DATABASE)

    effective_endpoint = endpoint_env or COSMOSDB_ENDPOINT
    effective_key = key_env or COSMOSDB_KEY
    effective_conn = conn_env or COSMOSDB_CONNECTION_STRING
    effective_db = db_env or DATABASE_NAME

    if effective_conn:
        auth_mode: AuthMode = "connection_string"
        auth_detail = f"connection_string from {conn_source or 'config'}"
    elif effective_key and effective_endpoint:
        auth_mode = "account_key"
        auth_detail = f"account key from {key_source or 'config'}"
    elif effective_endpoint:
        auth_mode = "default_azure_credential"
        auth_detail = (
            "no key/connection string — DefaultAzureCredential "
            f"(endpoint from {endpoint_source or 'config/default'})"
        )
    else:
        auth_mode = "default_azure_credential"
        auth_detail = "missing endpoint in env and config — will likely fail"

    return {
        "auth_mode": auth_mode,
        "auth_detail": auth_detail,
        "endpoint": effective_endpoint,
        "endpoint_source": endpoint_source or ("config" if COSMOSDB_ENDPOINT else "default"),
        "database": effective_db,
        "database_source": db_source or "config",
        "key_present": bool(effective_key),
        "key_source": key_source or ("config" if COSMOSDB_KEY else None),
        "key_masked": _mask_secret(effective_key),
        "connection_string_present": bool(effective_conn),
        "connection_string_source": conn_source or ("config" if COSMOSDB_CONNECTION_STRING else None),
        "connection_string_masked": _mask_secret(effective_conn),
        "env_probe": {
            "endpoint": _env_status(ENV_ENDPOINT),
            "key": _env_status(ENV_KEY),
            "connection_string": _env_status(ENV_CONNECTION_STRING),
            "database": _env_status(ENV_DATABASE),
        },
        "config_module": {
            "COSMOSDB_ENDPOINT": COSMOSDB_ENDPOINT,
            "COSMOSDB_KEY": _mask_secret(COSMOSDB_KEY),
            "COSMOSDB_CONNECTION_STRING": _mask_secret(COSMOSDB_CONNECTION_STRING),
            "DATABASE_NAME": DATABASE_NAME,
        },
    }


def log_cosmos_config_probe(context: str = "startup") -> None:
    cfg = describe_cosmos_config()
    logger.info("=== Cosmos DB config probe [%s] ===", context)
    logger.info("  dotenv_file: %s | loaded=%s | cwd=%s", ENV_FILE, DOTENV_LOADED, os.getcwd())
    logger.info("  auth_mode: %s", cfg["auth_mode"])
    logger.info("  auth_detail: %s", cfg["auth_detail"])
    logger.info("  effective_endpoint: %s (source: %s)", cfg["endpoint"], cfg["endpoint_source"])
    logger.info("  effective_database: %s (source: %s)", cfg["database"], cfg["database_source"])
    logger.info("  key: present=%s source=%s value=%s", cfg["key_present"], cfg["key_source"], cfg["key_masked"])
    logger.info(
        "  connection_string: present=%s source=%s value=%s",
        cfg["connection_string_present"],
        cfg["connection_string_source"],
        cfg["connection_string_masked"],
    )
    for group, statuses in cfg["env_probe"].items():
        for env_name, status in statuses.items():
            logger.info("  env[%s] %-28s %s", group, env_name, status)
    logger.info("  config.py values: %s", cfg["config_module"])
    logger.info("=== end Cosmos probe ===")


def _log_step(step: str, **kwargs: Any) -> None:
    parts = [f"Cosmos connect [{step}]"]
    for key, value in kwargs.items():
        parts.append(f"{key}={value}")
    logger.info(" | ".join(parts))


def create_cosmos_client(*, context: str) -> CosmosClient:
    """Create CosmosClient with step-by-step logging."""
    cfg = describe_cosmos_config()
    log_cosmos_config_probe(context=f"before_connect:{context}")

    auth_mode = cfg["auth_mode"]
    endpoint = cfg["endpoint"]
    conn = cfg["connection_string_present"] and (
        _resolve_from_env(ENV_CONNECTION_STRING)[0] or COSMOSDB_CONNECTION_STRING
    )
    key = _resolve_from_env(ENV_KEY)[0] or COSMOSDB_KEY

    try:
        if auth_mode == "connection_string" and conn:
            _log_step(
                "create_client",
                method="CosmosClient.from_connection_string",
                connection_string=cfg["connection_string_masked"],
            )
            client = CosmosClient.from_connection_string(conn)
            _log_step("create_client", result="success")
            return client

        if auth_mode == "account_key" and endpoint and key:
            _log_step(
                "create_client",
                method="CosmosClient(endpoint, credential=key)",
                endpoint=endpoint,
                key=cfg["key_masked"],
            )
            client = CosmosClient(endpoint, credential=key)
            _log_step("create_client", result="success")
            return client

        _log_step(
            "create_client",
            method="CosmosClient(endpoint, credential=DefaultAzureCredential)",
            endpoint=endpoint,
            note="Requires az login, managed identity, or AZURE_CLIENT_ID/SECRET/TENANT_ID",
        )
        credential = DefaultAzureCredential()
        _log_step("create_client", step="DefaultAzureCredential()", result="instantiated")
        client = CosmosClient(endpoint, credential=credential)
        _log_step("create_client", result="success")
        return client

    except Exception as exc:
        logger.error(
            "Cosmos connect FAILED at create_client | context=%s | auth_mode=%s | "
            "endpoint=%s | error_type=%s | error=%s",
            context,
            auth_mode,
            endpoint,
            type(exc).__name__,
            exc,
        )
        logger.error("Cosmos create_client traceback:\n%s", traceback.format_exc())
        raise


def get_container_client(container_name: str):
    """
    Return a Cosmos container client after validating config and connectivity.
    Logs each step; on failure logs the step and inputs (secrets masked).
    """
    cfg = describe_cosmos_config()
    database_name = cfg["database"]

    try:
        _log_step(
            "begin",
            container=container_name,
            database=database_name,
            endpoint=cfg["endpoint"],
            auth_mode=cfg["auth_mode"],
        )

        _log_step("step_1", action="create_cosmos_client")
        cosmos_client = create_cosmos_client(context=f"container:{container_name}")

        _log_step("step_2", action="get_database_client", database=database_name)
        database = cosmos_client.get_database_client(database_name)

        _log_step("step_3", action="get_container_client", container=container_name)
        container_client = database.get_container_client(container_name)

        _log_step("step_4", action="container_client.read() — verify container exists")
        container_client.read()
        _log_step("complete", container=container_name, result="success")
        return container_client

    except cosmos_exceptions.CosmosResourceNotFoundError as exc:
        logger.error(
            "Cosmos connect FAILED at step_4 (container not found) | container=%s | "
            "database=%s | endpoint=%s | status=%s | message=%s",
            container_name,
            database_name,
            cfg["endpoint"],
            getattr(exc, "status_code", "n/a"),
            exc,
        )
        raise HTTPException(
            status_code=404,
            detail=f"Container '{container_name}' not found in database '{database_name}'",
        ) from exc

    except cosmos_exceptions.CosmosHttpResponseError as exc:
        logger.error(
            "Cosmos connect FAILED (CosmosHttpResponseError) | step=unknown | container=%s | "
            "database=%s | endpoint=%s | status=%s | sub_status=%s | message=%s",
            container_name,
            database_name,
            cfg["endpoint"],
            getattr(exc, "status_code", "n/a"),
            getattr(exc, "sub_status", "n/a"),
            exc,
        )
        logger.error("Cosmos HttpResponse traceback:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Cosmos DB error ({getattr(exc, 'status_code', 'unknown')}): {exc}",
        ) from exc

    except Exception as exc:
        logger.error(
            "Cosmos connect FAILED | container=%s | database=%s | endpoint=%s | "
            "auth_mode=%s | error_type=%s | error=%s",
            container_name,
            database_name,
            cfg["endpoint"],
            cfg["auth_mode"],
            type(exc).__name__,
            exc,
        )
        logger.error("Cosmos connect traceback:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Cosmos connection failed: {type(exc).__name__}: {exc}",
        ) from exc


def get_partition_key_field(container_client) -> str:
    """Return partition key path without leading slash (e.g. 'id' or 'UserPrompt')."""
    props = container_client.read()
    paths = props.get("partitionKey", {}).get("paths", ["/id"])
    pk_path = paths[0] if paths else "/id"
    pk_field = pk_path.lstrip("/")
    logger.info("Cosmos container partition key path=%s field=%s", pk_path, pk_field)
    return pk_field


def create_item_logged(container_client, doc_dict: dict, *, context: str) -> dict:
    """Create a Cosmos item with partition key + step logging."""
    pk_field = get_partition_key_field(container_client)
    if pk_field not in doc_dict:
        logger.error(
            "Cosmos create_item FAILED | missing partition key field '%s' in document | "
            "doc_keys=%s | context=%s",
            pk_field,
            list(doc_dict.keys()),
            context,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Document missing required partition key field '{pk_field}'",
        )

    partition_value = doc_dict[pk_field]
    logger.info(
        "Cosmos create_item | context=%s | id=%s | partition_key_field=%s | "
        "partition_key_value=%r",
        context,
        doc_dict.get("id"),
        pk_field,
        partition_value,
    )

    try:
        # Partition key must be in the document body; this SDK version does not accept
        # partition_key= as a create_item kwarg (it leaks into HTTP and raises TypeError).
        created = container_client.create_item(body=doc_dict)
        logger.info("Cosmos create_item | context=%s | result=success | id=%s", context, created.get("id"))
        return created
    except cosmos_exceptions.CosmosHttpResponseError as exc:
        logger.error(
            "Cosmos create_item FAILED | context=%s | status=%s | message=%s",
            context,
            getattr(exc, "status_code", "n/a"),
            exc,
        )
        logger.error("Cosmos create_item traceback:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Cosmos create_item failed ({getattr(exc, 'status_code', 'unknown')}): {exc}",
        ) from exc
    except Exception as exc:
        logger.error(
            "Cosmos create_item FAILED | context=%s | error_type=%s | error=%s",
            context,
            type(exc).__name__,
            exc,
        )
        logger.error("Cosmos create_item traceback:\n%s", traceback.format_exc())
        raise


def cosmos_item_to_feedback(doc: dict) -> FeedbackDocument:
    """Map raw Cosmos document to API response model (avoids response validation errors)."""
    ts = doc.get("_ts")
    if ts is not None:
        try:
            ts = int(ts)
        except (TypeError, ValueError):
            logger.warning("Could not coerce _ts=%r to int for document id=%s", ts, doc.get("id"))
            ts = None
    return FeedbackDocument(
        id=str(doc["id"]) if doc.get("id") is not None else None,
        UserPrompt=doc.get("UserPrompt") or "",
        Query=doc.get("Query") or "",
        UserPromptVector=doc.get("UserPromptVector"),
        QueryVector=doc.get("QueryVector"),
        _ts=ts,
    )
