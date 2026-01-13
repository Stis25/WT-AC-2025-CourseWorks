from pydantic import BaseModel, Field


class NLUInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


class NLUResult(BaseModel):
    # Заглушка: в будущем распарсим текст в TaskCreate
    intent: str
    extracted: dict
