"""Client LLM unifié — supporte Anthropic, OpenAI-compatible et Gemini.

Lecture de la config depuis /data/options.json (HA add-on) ou env vars :
  LLM_PROVIDER : 'anthropic' | 'openai' | 'gemini'
  LLM_API_KEY  : clé du provider
  LLM_MODEL    : modèle (laisser vide pour le défaut)
  LLM_BASE_URL : URL custom pour OpenAI-compatible (OpenRouter, Groq, Ollama…)

Le code applicatif (ai_chat.py, ai_import.py) appelle :
  get_llm_client().chat(messages, system, tools)
  get_llm_client().vision(image_b64, mime_type, prompt, system)

Format interne (provider-agnostic) :
  - messages : [{"role": "user"|"assistant", "content": str OR blocks}]
    où blocks = [{"type":"text","text":...},
                 {"type":"tool_use","id":..,"name":..,"input":..},
                 {"type":"tool_result","tool_use_id":..,"content":str,"is_error":bool}]
  - tools : [{"name", "description", "input_schema"}]  (style Anthropic, on traduit
    pour OpenAI/Gemini en interne)
  - Réponse : LLMResponse(text, tool_calls=[{id,name,input}], stop_reason)
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================================
# Types internes
# ============================================================

@dataclass
class LLMResponse:
    text: Optional[str] = None
    tool_calls: list[dict] = field(default_factory=list)
    stop_reason: str = "end_turn"


class LLMError(Exception):
    pass


DEFAULT_MODELS = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.5-flash",
}


# ============================================================
# Configuration
# ============================================================

def _load_ha_options() -> dict:
    p = Path("/data/options.json")
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def get_llm_config() -> dict:
    """Lit la config LLM depuis env > options HA > défaut.

    Compat ascendante : si llm_api_key vide mais claude_api_key présent,
    on bascule en mode 'anthropic' avec cette clé.
    """
    opts = _load_ha_options()
    provider = (os.environ.get("LLM_PROVIDER") or opts.get("llm_provider") or "").strip().lower()
    api_key = (os.environ.get("LLM_API_KEY") or opts.get("llm_api_key") or "").strip()
    model = (os.environ.get("LLM_MODEL") or opts.get("llm_model") or "").strip()
    base_url = (os.environ.get("LLM_BASE_URL") or opts.get("llm_base_url") or "").strip()

    # Compat : si pas de provider ou pas de clé, on retombe sur l'ancienne
    # config claude_api_key
    legacy_key = (os.environ.get("CLAUDE_API_KEY") or opts.get("claude_api_key") or "").strip()
    if not api_key and legacy_key:
        api_key = legacy_key
        if not provider:
            provider = "anthropic"

    if not provider:
        provider = "anthropic"
    if provider not in DEFAULT_MODELS:
        provider = "anthropic"
    if not model:
        model = DEFAULT_MODELS[provider]

    return {
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
    }


def is_llm_available() -> bool:
    return bool(get_llm_config().get("api_key"))


# ============================================================
# Interface unifiée + factory
# ============================================================

class LLMClient:
    """Interface unifiée."""
    def chat(
        self,
        messages: list[dict],
        system: str,
        tools: Optional[list[dict]] = None,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        raise NotImplementedError

    def vision(
        self,
        image_b64: str,
        mime_type: str,
        prompt: str,
        system: str,
        max_tokens: int = 1024,
    ) -> str:
        """Analyse une image, retourne le texte de réponse brut."""
        raise NotImplementedError


def get_llm_client() -> LLMClient:
    cfg = get_llm_config()
    if not cfg["api_key"]:
        raise LLMError(
            "Aucune clé API LLM configurée. Renseigne llm_api_key dans la config "
            "de l'add-on (Paramètres > Add-on Budget > Configuration)."
        )
    provider = cfg["provider"]
    if provider == "anthropic":
        return AnthropicAdapter(cfg)
    if provider == "openai":
        return OpenAIAdapter(cfg)
    if provider == "gemini":
        return GeminiAdapter(cfg)
    raise LLMError(f"Provider inconnu : {provider}")


# ============================================================
# Adaptateur Anthropic
# ============================================================

class AnthropicAdapter(LLMClient):
    def __init__(self, cfg: dict):
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise LLMError("SDK anthropic absent") from e
        self.client = Anthropic(api_key=cfg["api_key"])
        self.model = cfg["model"]

    def chat(self, messages, system, tools=None, max_tokens=2048) -> LLMResponse:
        # Anthropic accepte directement notre format
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        try:
            resp = self.client.messages.create(**kwargs)
        except Exception as e:
            raise LLMError(f"Anthropic error: {e}")

        text_parts: list[str] = []
        tool_calls: list[dict] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
        return LLMResponse(
            text="\n".join(t for t in text_parts if t).strip() or None,
            tool_calls=tool_calls,
            stop_reason=resp.stop_reason or "end_turn",
        )

    def vision(self, image_b64, mime_type, prompt, system, max_tokens=1024) -> str:
        try:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {
                            "type": "base64", "media_type": mime_type, "data": image_b64,
                        }},
                        {"type": "text", "text": prompt},
                    ],
                }],
            )
        except Exception as e:
            raise LLMError(f"Anthropic vision error: {e}")
        return "".join(b.text for b in resp.content if b.type == "text").strip()


# ============================================================
# Adaptateur OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama, ...)
# ============================================================

class OpenAIAdapter(LLMClient):
    def __init__(self, cfg: dict):
        try:
            from openai import OpenAI
        except ImportError as e:
            raise LLMError("SDK openai absent") from e
        kwargs = {"api_key": cfg["api_key"]}
        if cfg.get("base_url"):
            kwargs["base_url"] = cfg["base_url"]
        self.client = OpenAI(**kwargs)
        self.model = cfg["model"]

    def _to_openai_messages(self, system: str, messages: list[dict]) -> list[dict]:
        """Traduit nos messages internes vers le format OpenAI Chat Completions."""
        out: list[dict] = [{"role": "system", "content": system}]
        for m in messages:
            role = m["role"]
            content = m.get("content")
            if role == "user":
                # Si content est str → simple
                if isinstance(content, str):
                    out.append({"role": "user", "content": content})
                    continue
                # Si content est list de blocks, ce sont des tool_result
                # → chaque tool_result devient un message role=tool
                if isinstance(content, list):
                    for blk in content:
                        if blk.get("type") == "tool_result":
                            tool_content = blk.get("content", "")
                            if not isinstance(tool_content, str):
                                tool_content = json.dumps(tool_content, default=str)
                            out.append({
                                "role": "tool",
                                "tool_call_id": blk["tool_use_id"],
                                "content": tool_content,
                            })
                        elif blk.get("type") == "text":
                            out.append({"role": "user", "content": blk.get("text", "")})
                continue
            if role == "assistant":
                # content peut être str ou list de blocks (text + tool_use)
                if isinstance(content, str):
                    out.append({"role": "assistant", "content": content})
                    continue
                if isinstance(content, list):
                    text_parts: list[str] = []
                    tool_calls: list[dict] = []
                    for blk in content:
                        if blk.get("type") == "text":
                            text_parts.append(blk.get("text", ""))
                        elif blk.get("type") == "tool_use":
                            tool_calls.append({
                                "id": blk["id"],
                                "type": "function",
                                "function": {
                                    "name": blk["name"],
                                    "arguments": json.dumps(blk.get("input", {})),
                                },
                            })
                    msg: dict = {"role": "assistant", "content": "\n".join(text_parts) or None}
                    if tool_calls:
                        msg["tool_calls"] = tool_calls
                    out.append(msg)
        return out

    def _to_openai_tools(self, tools: list[dict]) -> list[dict]:
        return [{
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
            },
        } for t in tools]

    def chat(self, messages, system, tools=None, max_tokens=2048) -> LLMResponse:
        params = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": self._to_openai_messages(system, messages),
        }
        if tools:
            params["tools"] = self._to_openai_tools(tools)
        try:
            resp = self.client.chat.completions.create(**params)
        except Exception as e:
            raise LLMError(f"OpenAI error: {e}")
        choice = resp.choices[0]
        text = (choice.message.content or "").strip() or None
        tool_calls = []
        for tc in (choice.message.tool_calls or []):
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            tool_calls.append({"id": tc.id, "name": tc.function.name, "input": args})
        stop = "tool_use" if tool_calls else (choice.finish_reason or "end_turn")
        return LLMResponse(text=text, tool_calls=tool_calls, stop_reason=stop)

    def vision(self, image_b64, mime_type, prompt, system, max_tokens=1024) -> str:
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}",
                        }},
                    ]},
                ],
            )
        except Exception as e:
            raise LLMError(f"OpenAI vision error: {e}")
        return (resp.choices[0].message.content or "").strip()


# ============================================================
# Adaptateur Gemini
# ============================================================

class GeminiAdapter(LLMClient):
    def __init__(self, cfg: dict):
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise LLMError("SDK google-generativeai absent") from e
        genai.configure(api_key=cfg["api_key"])
        self.genai = genai
        self.model_name = cfg["model"]

    def _to_gemini_history(self, messages: list[dict]) -> list[dict]:
        """Traduit nos messages internes vers le format Gemini (Content list).

        Gemini distingue role='user' et role='model'. Les tool_result vont
        dans un message user avec parts[function_response].
        """
        out: list[dict] = []
        for m in messages:
            role = m["role"]
            content = m.get("content")
            gemini_role = "user" if role == "user" else "model"
            parts: list[dict] = []
            if isinstance(content, str):
                parts.append({"text": content})
            elif isinstance(content, list):
                for blk in content:
                    t = blk.get("type")
                    if t == "text":
                        parts.append({"text": blk.get("text", "")})
                    elif t == "tool_use":
                        parts.append({
                            "function_call": {
                                "name": blk["name"],
                                "args": blk.get("input", {}),
                            },
                        })
                    elif t == "tool_result":
                        # tool_result → role=user avec function_response
                        # On force le role à 'user' pour Gemini
                        gemini_role = "user"
                        raw = blk.get("content", "")
                        if isinstance(raw, str):
                            try:
                                payload = json.loads(raw)
                            except json.JSONDecodeError:
                                payload = {"result": raw}
                        else:
                            payload = raw
                        # Gemini attend un response dict, on retrouve le name
                        # via le tool_use_id (correspond à l'index du tool_use
                        # précédent). En pratique on stocke le name dans le
                        # payload aussi.
                        parts.append({
                            "function_response": {
                                "name": payload.get("_tool_name") or "tool",
                                "response": payload,
                            },
                        })
            if parts:
                out.append({"role": gemini_role, "parts": parts})
        return out

    def _to_gemini_tools(self, tools: list[dict]) -> list[dict]:
        return [{
            "function_declarations": [{
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": _clean_schema_for_gemini(
                    t.get("input_schema") or {"type": "object", "properties": {}}
                ),
            } for t in tools],
        }]

    def chat(self, messages, system, tools=None, max_tokens=2048) -> LLMResponse:
        kwargs = {
            "system_instruction": system,
            "generation_config": {"max_output_tokens": max_tokens},
        }
        if tools:
            kwargs["tools"] = self._to_gemini_tools(tools)
        model = self.genai.GenerativeModel(self.model_name, **kwargs)
        history = self._to_gemini_history(messages)
        try:
            resp = model.generate_content(history)
        except Exception as e:
            raise LLMError(f"Gemini error: {e}")
        text_parts: list[str] = []
        tool_calls: list[dict] = []
        for cand in (resp.candidates or []):
            for part in (cand.content.parts if cand.content else []):
                if hasattr(part, "text") and part.text:
                    text_parts.append(part.text)
                if hasattr(part, "function_call") and part.function_call and part.function_call.name:
                    fc = part.function_call
                    args = dict(fc.args) if fc.args else {}
                    tool_calls.append({
                        "id": f"call_{uuid.uuid4().hex[:12]}",
                        "name": fc.name,
                        "input": args,
                    })
        stop = "tool_use" if tool_calls else "end_turn"
        return LLMResponse(
            text="\n".join(t for t in text_parts if t).strip() or None,
            tool_calls=tool_calls,
            stop_reason=stop,
        )

    def vision(self, image_b64, mime_type, prompt, system, max_tokens=1024) -> str:
        import base64 as _b64
        model = self.genai.GenerativeModel(
            self.model_name,
            system_instruction=system,
            generation_config={"max_output_tokens": max_tokens},
        )
        try:
            resp = model.generate_content([
                {"mime_type": mime_type, "data": _b64.b64decode(image_b64)},
                prompt,
            ])
        except Exception as e:
            raise LLMError(f"Gemini vision error: {e}")
        return (resp.text or "").strip()


def _clean_schema_for_gemini(schema: dict) -> dict:
    """Gemini est strict sur le schéma JSON. On nettoie les champs non supportés."""
    if not isinstance(schema, dict):
        return schema
    out = {}
    for k, v in schema.items():
        if k in ("type", "description", "properties", "required", "items", "enum"):
            if isinstance(v, dict):
                out[k] = {kk: _clean_schema_for_gemini(vv) for kk, vv in v.items()}
            elif isinstance(v, list):
                out[k] = [_clean_schema_for_gemini(x) if isinstance(x, dict) else x for x in v]
            else:
                out[k] = v
    return out
