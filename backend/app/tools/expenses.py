"""Expense tool — reads from MongoDB expenses + user_budgets collections."""


async def get_expense_summary(user_id: str, period: str = "current_month") -> dict:
    """Returns the user's monthly spending breakdown, budget status per category, and savings rate."""
    from app.db.mongo import get_expenses, get_user_income, get_user_budgets

    expenses = await get_expenses(user_id)
    income   = await get_user_income(user_id)
    budgets  = await get_user_budgets(user_id)  # { slug: amount } — only user-set values

    if not expenses:
        return {
            "period":             period,
            "total_spent":        0,
            "monthly_income":     income,
            "savings":            income,
            "savings_rate_pct":   100.0 if income > 0 else 0,
            "investable_surplus": max(income - 5000, 0),
            "budget_status":      [],
            "top_category":       "N/A",
            "transaction_count":  0,
            "by_category":        {},
        }

    total_spent = sum(e["amount"] for e in expenses)

    by_category: dict[str, float] = {}
    for e in expenses:
        cat = e.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + e["amount"]

    budget_status = []
    for cat, spent in by_category.items():
        budget   = budgets.get(cat, 0)   # 0 means user hasn't set a budget
        pct_used = round((spent / budget * 100), 1) if budget > 0 else 0
        budget_status.append({
            "category":     cat,
            "spent":        spent,
            "budget":       budget,
            "percent_used": pct_used,
            "status": (
                "OVER BUDGET" if budget > 0 and pct_used > 100
                else "WARNING"  if budget > 0 and pct_used > 80
                else "NO BUDGET" if budget == 0
                else "OK"
            ),
        })

    savings      = income - total_spent
    savings_rate = round((savings / income) * 100, 1) if income > 0 else 0

    return {
        "period":             period,
        "total_spent":        total_spent,
        "monthly_income":     income,
        "savings":            savings,
        "savings_rate_pct":   savings_rate,
        "investable_surplus": max(savings - 5000, 0),
        "budget_status":      budget_status,
        "top_category":       max(by_category, key=by_category.get) if by_category else "N/A",
        "transaction_count":  len(expenses),
        "by_category":        by_category,
    }


async def get_expense_trends(user_id: str, months: int = 6) -> list:
    """Returns monthly spending totals for the last N months."""
    from app.db.mongo import get_expenses
    from datetime import datetime
    from collections import OrderedDict
    import calendar

    expenses = await get_expenses(user_id)

    now    = datetime.now()
    trends = OrderedDict()
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        month_key   = f"{y}-{m:02d}"
        month_label = f"{calendar.month_name[m][:3]} {str(y)[2:]}"
        trends[month_key] = {"label": month_label, "spent": 0}

    for e in expenses:
        m_key = e["date"][:7]
        if m_key in trends:
            trends[m_key]["spent"] += e["amount"]

    return [{"name": v["label"], "spent": v["spent"]} for v in trends.values()]