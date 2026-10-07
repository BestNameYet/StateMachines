from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    """Durable configuration, transaction state, and append-only receipts."""

    def __init__(self, path: str | Path, default_config: dict[str, Any]) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()
        if self.active_config_version() is None:
            self.replace_config(default_config, expected_version=0)

    def _init_schema(self) -> None:
        with self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS config_versions (
                    version INTEGER PRIMARY KEY,
                    config_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS active_config (
                    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                    version INTEGER NOT NULL REFERENCES config_versions(version)
                );
                CREATE TABLE IF NOT EXISTS transactions (
                    transaction_id TEXT PRIMARY KEY,
                    behavior TEXT NOT NULL,
                    config_version INTEGER NOT NULL,
                    state_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(transaction_id, seq)
                );
                """
            )

    def active_config_version(self) -> int | None:
        row = self._conn.execute("SELECT version FROM active_config WHERE singleton=1").fetchone()
        return int(row["version"]) if row else None

    def get_config_version(self, version: int) -> dict[str, Any]:
        row = self._conn.execute("SELECT config_json FROM config_versions WHERE version=?", (version,)).fetchone()
        if not row:
            raise ValueError(f"unknown config version: {version}")
        return json.loads(row["config_json"])

    def get_config(self) -> tuple[int, dict[str, Any]]:
        version = self.active_config_version()
        if version is None:
            raise RuntimeError("active configuration is missing")
        return version, self.get_config_version(version)

    def replace_config(self, config: dict[str, Any], expected_version: int | None = None) -> int:
        payload = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                current = self.active_config_version()
                current_num = current or 0
                if expected_version is not None and expected_version != current_num:
                    raise ValueError(f"config version conflict: expected {expected_version}, current {current_num}")
                version = current_num + 1
                self._conn.execute(
                    "INSERT INTO config_versions(version, config_json, created_at) VALUES(?,?,?)",
                    (version, payload, utc_now()),
                )
                self._conn.execute(
                    "INSERT INTO active_config(singleton, version) VALUES(1, ?) "
                    "ON CONFLICT(singleton) DO UPDATE SET version=excluded.version",
                    (version,),
                )
                self._conn.commit()
                return version
            except Exception:
                self._conn.rollback()
                raise

    def create_transaction(self, behavior: str, config_version: int, state: dict[str, Any]) -> str:
        txid = str(uuid.uuid4())
        now = utc_now()
        with self._conn:
            self._conn.execute(
                "INSERT INTO transactions(transaction_id, behavior, config_version, state_json, status, created_at, updated_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (txid, behavior, config_version, json.dumps(state), "active", now, now),
            )
        self.append_event(txid, "created", {"behavior": behavior, "config_version": config_version, "state": state})
        return txid

    def get_transaction(self, transaction_id: str) -> dict[str, Any]:
        row = self._conn.execute("SELECT * FROM transactions WHERE transaction_id=?", (transaction_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown transaction_id: {transaction_id}")
        return {
            "transaction_id": row["transaction_id"],
            "behavior": row["behavior"],
            "config_version": row["config_version"],
            "state": json.loads(row["state_json"]),
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def update_transaction(self, transaction_id: str, state: dict[str, Any], status: str = "active") -> None:
        with self._conn:
            cur = self._conn.execute(
                "UPDATE transactions SET state_json=?, status=?, updated_at=? WHERE transaction_id=?",
                (json.dumps(state), status, utc_now(), transaction_id),
            )
            if cur.rowcount != 1:
                raise ValueError(f"unknown transaction_id: {transaction_id}")

    def append_event(self, transaction_id: str, kind: str, payload: Any) -> None:
        row = self._conn.execute(
            "SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM events WHERE transaction_id=?",
            (transaction_id,),
        ).fetchone()
        seq = int(row["next_seq"])
        with self._conn:
            self._conn.execute(
                "INSERT INTO events(transaction_id, seq, kind, payload_json, created_at) VALUES(?,?,?,?,?)",
                (transaction_id, seq, kind, json.dumps(payload, ensure_ascii=False), utc_now()),
            )

    def receipt(self, transaction_id: str) -> dict[str, Any]:
        tx = self.get_transaction(transaction_id)
        rows = self._conn.execute(
            "SELECT seq, kind, payload_json, created_at FROM events WHERE transaction_id=? ORDER BY seq",
            (transaction_id,),
        ).fetchall()
        tx["events"] = [
            {
                "seq": row["seq"],
                "kind": row["kind"],
                "payload": json.loads(row["payload_json"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        return tx
