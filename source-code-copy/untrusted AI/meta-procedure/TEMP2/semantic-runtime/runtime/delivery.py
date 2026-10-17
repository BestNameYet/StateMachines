"""Hold address results until their terminal delivery is acknowledged."""

import hashlib
import threading
import uuid

from .address_codec import decode_request


class AddressConsumed(Exception):
    """Signal that an acknowledged one-use address was requested again."""


class DeliveryNotFound(Exception):
    """Signal that an acknowledgement names no known delivery."""


class DeliveryLedger:
    """Resolve each address once and replay its result until acknowledgement."""

    def __init__(self, runner):
        self.runner = runner
        self.lock = threading.Lock()
        self.pending = {}
        self.consumed = set()
        self.acknowledged = set()
        self.terminals = {}

    def resolve(self, address: str) -> dict:
        """Return one stable pending delivery for an address."""
        with self.lock:
            if address in self.consumed:
                raise AddressConsumed(address)
            if address not in self.pending:
                self.pending[address] = self._create_delivery(address)
            return dict(self.pending[address])

    def acknowledge(self, delivery_id: str) -> dict:
        """Consume an address only after its delivery is acknowledged."""
        with self.lock:
            if delivery_id in self.acknowledged:
                return {"status": "ACKNOWLEDGED", "delivery_id": delivery_id}
            address = self._address_for(delivery_id)
            terminal = self.pending[address].get("terminal")
            self.pending.pop(address)
            if self.terminals.get(str(terminal)) == address:
                self.terminals.pop(str(terminal))
            self.consumed.add(address)
            self.acknowledged.add(delivery_id)
            return {"status": "ACKNOWLEDGED", "delivery_id": delivery_id}

    def publish(self, terminal, result: dict) -> dict:
        """Place one MCP result in a terminal outbox for Apps Script."""
        with self.lock:
            address = "mcp:" + uuid.uuid4().hex
            delivery = self._delivery(address, terminal, result)
            self.pending[address] = delivery
            self.terminals[str(terminal)] = address
            return dict(delivery)

    def latest(self, terminal) -> dict:
        """Return the latest unacknowledged result for one terminal."""
        with self.lock:
            address = self.terminals.get(str(terminal))
            if address is None:
                raise DeliveryNotFound(str(terminal))
            return dict(self.pending[address])

    def _create_delivery(self, address: str) -> dict:
        """Execute one address and package the result for Apps Script."""
        command = decode_request(address)
        result = self.runner.transaction(command["value"], response=command.get("response"), terminal=command.get("terminal"))
        return self._delivery(address, command.get("terminal"), result)

    def _delivery(self, address: str, terminal, result: dict) -> dict:
        """Build one pending delivery shared by push and address flows."""
        delivery_id = hashlib.sha256(address.encode()).hexdigest()[:24]
        return {
            "status": "PENDING_ACK",
            "delivery_id": delivery_id,
            "terminal": terminal,
            "result": result,
            "ack_path": "/ack",
        }

    def _address_for(self, delivery_id: str) -> str:
        """Find the pending address belonging to a delivery identifier."""
        for address, delivery in self.pending.items():
            if delivery["delivery_id"] == delivery_id:
                return address
        raise DeliveryNotFound(delivery_id)
