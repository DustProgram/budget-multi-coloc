"""Compatibilité Mistral : ordre des rôles et identifiants d'appel d'outil."""
from services.llm_client import OpenAIAdapter, _mistral_compat


def _adapter(provider):
    a = OpenAIAdapter.__new__(OpenAIAdapter)
    a.provider, a.model = provider, "m"
    return a


HISTORY = [
    {"role": "user", "content": "Ajoute 12 € de pain"},
    {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_01ABCdef", "name": "add_purchase", "input": {}}]},
    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_01ABCdef", "content": "ok"}]},
    {"role": "user", "content": "Et le solde ?"},
]


def test_mistral_ids_names_and_role_order():
    msgs = _adapter("mistral")._to_openai_messages("sys", HISTORY)
    roles = [m["role"] for m in msgs]
    assert roles == ["system", "user", "assistant", "tool", "assistant", "user"]
    call_id = msgs[2]["tool_calls"][0]["id"]
    assert len(call_id) == 9 and call_id.isalnum()
    assert msgs[3]["tool_call_id"] == call_id and msgs[3]["name"] == "add_purchase"


def test_native_mistral_ids_kept_and_other_providers_untouched():
    assert _mistral_compat([{"role": "tool", "tool_call_id": "aB3dE6gH9", "content": ""}])[0]["tool_call_id"] == "aB3dE6gH9"
    msgs = _adapter("openai")._to_openai_messages("sys", HISTORY)
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "tool", "user"]
    assert msgs[2]["tool_calls"][0]["id"] == "toolu_01ABCdef"


def test_rate_limit_message_and_pacing():
    import time
    import pytest
    from services import llm_client

    class Boom(Exception):
        status_code = 429

    class Fake:
        class chat:
            class completions:
                @staticmethod
                def create(**_):
                    raise Boom("Rate limit exceeded")

    a = _adapter("mistral")
    a.client = Fake
    t0 = time.monotonic()
    for _ in range(2):
        with pytest.raises(llm_client.LLMError, match="429"):
            a.chat([{"role": "user", "content": "x"}], "sys")
    assert time.monotonic() - t0 >= llm_client.MISTRAL_MIN_INTERVAL
