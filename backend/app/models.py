from typing import Optional, List
from pydantic import BaseModel

class FeedbackDocument(BaseModel):
    id: Optional[str] = None
    UserPrompt: str
    Query: str
    UserPromptVector: Optional[List[float]] = None
    QueryVector: Optional[List[float]] = None
    _ts: Optional[int] = None

    class Config:
        from_attributes = True 