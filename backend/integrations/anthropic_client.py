import anthropic
from backend.config import settings

_client: anthropic.Anthropic | None = None


def get_anthropic() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def call_claude(
    system: str,
    prompt: str,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 4096,
) -> str:
    client = get_anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
