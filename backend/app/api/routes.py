from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.mongo import (
    get_expenses, add_expense, delete_expense,
    get_user_budgets, update_user_budgets,
    get_all_categories_for_user, add_user_category, delete_user_category,
)
from app.core.auth import get_current_user, User

# ── Expenses ──────────────────────────────────────────────────────────────
expenses_router = APIRouter(prefix="/api/expenses", tags=["expenses"])


class ExpenseRequest(BaseModel):
    amount: float
    description: str
    category: str
    date: str  # YYYY-MM-DD


@expenses_router.get("")
async def list_expenses(current_user: Annotated[User, Depends(get_current_user)]):
    return await get_expenses(current_user.id)


@expenses_router.post("")
async def create_expense(req: ExpenseRequest, current_user: Annotated[User, Depends(get_current_user)]):
    return await add_expense(current_user.id, req.amount, req.description, req.category, req.date)


# NOTE: static sub-paths (/summary /trends /budgets /categories) MUST be
# declared BEFORE the parameterised /{expense_id} route.

@expenses_router.get("/summary")
async def expense_summary(current_user: Annotated[User, Depends(get_current_user)]):
    from app.tools.expenses import get_expense_summary
    return await get_expense_summary(user_id=current_user.id)


@expenses_router.get("/trends")
async def expense_trends(current_user: Annotated[User, Depends(get_current_user)]):
    from app.tools.expenses import get_expense_trends
    return await get_expense_trends(user_id=current_user.id)


# ── Budget endpoints ──────────────────────────────────────────────────────

@expenses_router.get("/budgets")
async def get_budgets(current_user: Annotated[User, Depends(get_current_user)]):
    """Return user's saved budgets: { slug: amount }"""
    return await get_user_budgets(current_user.id)


class BudgetUpdate(BaseModel):
    budgets: dict  # { "food_dining": 8000, "transport": 3000 }


@expenses_router.patch("/budgets")
async def set_budgets(req: BudgetUpdate, current_user: Annotated[User, Depends(get_current_user)]):
    """Save (upsert) the entire budgets map for the user."""
    await update_user_budgets(current_user.id, req.budgets)
    return {"status": "updated"}


# ── Category endpoints ────────────────────────────────────────────────────

@expenses_router.get("/categories")
async def list_categories(current_user: Annotated[User, Depends(get_current_user)]):
    """Return master categories + user's custom categories."""
    return await get_all_categories_for_user(current_user.id)


class CategoryCreate(BaseModel):
    slug: str    # will be normalised to lowercase_underscore
    label: str
    icon: str = "📂"


@expenses_router.post("/categories")
async def create_category(req: CategoryCreate, current_user: Annotated[User, Depends(get_current_user)]):
    """Create a custom category for this user."""
    result = await add_user_category(current_user.id, req.slug, req.label, req.icon)
    if result["status"] == "exists":
        raise HTTPException(status_code=409, detail=f"Category already exists (source: {result['source']})")
    return result


@expenses_router.delete("/categories/{slug}")
async def remove_category(slug: str, current_user: Annotated[User, Depends(get_current_user)]):
    """Delete a user's custom category (master categories cannot be deleted)."""
    deleted = await delete_user_category(current_user.id, slug)
    if not deleted:
        raise HTTPException(status_code=404, detail="Custom category not found or is a master category")
    return {"status": "deleted", "slug": slug}


# ── Parameterised expense route (MUST be last) ────────────────────────────

@expenses_router.delete("/{expense_id}")
async def remove_expense(expense_id: str, current_user: Annotated[User, Depends(get_current_user)]):
    await delete_expense(current_user.id, expense_id)
    return {"status": "deleted"}