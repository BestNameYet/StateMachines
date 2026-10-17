"""Verify terminal-ID state and receipt-only replies with a renderer stand-in."""
import unittest
from unittest.mock import patch
import server
from runtime.token_codec import decode


class TerminalPushTest(unittest.TestCase):
    """Test only the new terminal routing and delivery commit boundary."""
    def setUp(self):
        server.TERMINAL_STATE.clear()

    def test_sequence_and_receipts(self):
        deliveries = []
        def rendered(delivery):
            deliveries.append(delivery)
            return True
        with patch('server.push_delivery', side_effect=rendered):
            calls = [{'value': {'alias': 'demo'}, 'terminal': 2},
                     {'value': '2', 'response': 'CONTINUE'},
                     {'terminal': 2, 'response': 'CONTINUE'}]
            for arguments in calls:
                reply = server.call_transaction(arguments)
                notice = reply['structuredContent']
                self.assertEqual(notice['status'], 'AVAILABLE_ON_TERMINAL')
                self.assertEqual(set(notice), {'status', 'terminal', 'terminal_name', 'terminal_url'})
                for field in ('render', 'options', 'commands', 'in_token', 'out_token'):
                    self.assertNotIn(field, reply)
                    self.assertNotIn(field, notice)
        self.assertEqual([decode(d['result']['in_token'])['screen'] for d in deliveries],
                         ['START', 'SECOND', 'END'])
        self.assertEqual(deliveries[-1]['result']['status'], 'TERMINAL')

    def test_failed_write_preserves_state_and_retry(self):
        with patch('server.push_delivery', return_value=True):
            server.call_transaction({'value': {'alias': 'demo'}, 'terminal': 2})
        before = server.TERMINAL_STATE['2']
        with patch('server.push_delivery', side_effect=OSError('private diagnostic')):
            reply = server.call_transaction({'value': '2', 'response': 'CONTINUE'})
        self.assertTrue(reply['isError'])
        self.assertNotIn('private diagnostic', str(reply))
        self.assertEqual(server.TERMINAL_STATE['2'], before)
        with patch('server.push_delivery', return_value=True):
            server.call_transaction({'value': '2', 'response': 'CONTINUE'})
        self.assertEqual(decode(server.TERMINAL_STATE['2'])['screen'], 'SECOND')

    def test_uninitialized_and_invalid_response(self):
        with self.assertRaises(ValueError):
            server.call_transaction({'value': '2', 'response': 'CONTINUE'})
        with patch('server.push_delivery', return_value=True):
            server.call_transaction({'value': {'alias': 'demo'}, 'terminal': 2})
        before = server.TERMINAL_STATE['2']
        with self.assertRaises(ValueError):
            server.call_transaction({'value': '2', 'response': 'NOT_AN_OPTION'})
        self.assertEqual(server.TERMINAL_STATE['2'], before)


if __name__ == '__main__':
    unittest.main()
