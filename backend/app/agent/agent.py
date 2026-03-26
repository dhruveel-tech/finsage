"""
FinSage AI Agent — async version using NVIDIA NIM + tool calling.
Saves every query + response to MongoDB.
"""

import os
import json
from openai import AsyncOpenAI
from dotenv import load_dotenv
from app.tools.market import get_market_analysis
from app.tools.portfolio import get_portfolio_summary, add_holding
from app.tools.expenses import get_expense_summary

load_dotenv()

client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY"),
)

MODEL = "meta/llama-3.3-70b-instruct"

SYSTEM_PROMPT = """You are FinSage, an AI-powered personal financial advisor.

YOUR TOOLS (always use them — never guess financial data from memory):
- get_market_analysis(ticker)                    → live price, RSI, signals
- get_portfolio_summary()                        → holdings, allocation, cost basis
- get_expense_summary()                          → spending, budgets, savings rate
- add_holding(ticker, shares, avg_buy_price)     → add stock to portfolio

REASONING RULES:
1. Before any advice, call the relevant tools to get real data
2. Never quote stock prices from your own memory — always call get_market_analysis
3. Combine market signals + portfolio state + expense health for holistic advice
4. Be specific and actionable — say "invest ₹50,000 in NIFTYBEES.NS", not "consider diversifying"
5. Be honest about risks. Never promise returns.

RESPONSE FORMAT for advice:
📊 SITUATION: [what the data shows]
💡 RECOMMENDATION: [specific action]
⚠️  RISKS: [honest downsides]
✅ NEXT STEP: [one thing to do today]

Always end with:
"⚠️ Educational info only — not licensed investment advice."
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_market_analysis",
            "description": "Fetches live stock price, RSI indicator, and momentum signal for a ticker. ALWAYS call this before discussing any specific stock.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker e.g. AAPL, TCS.NS, BTC-USD"}
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_summary",
            "description": "Returns the user's current stock holdings, allocation percentages, and cost basis.",
            "parameters": {
                "type": "object",
                "properties": {
                    "include_metrics": {"type": "boolean", "default": True}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_expense_summary",
            "description": "Returns the user's monthly spending breakdown, budget status, and savings rate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {"type": "string", "enum": ["current_month", "last_month"], "default": "current_month"}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_holding",
            "description": "Adds a new stock holding or updates an existing one in the user's portfolio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker":        {"type": "string"},
                    "shares":        {"type": "number"},
                    "avg_buy_price": {"type": "number"},
                },
                "required": ["ticker", "shares", "avg_buy_price"],
            },
        },
    },
]


async def execute_tool(tool_name: str, tool_input: dict, user_id: str) -> str:
    """Routes tool calls from the LLM to actual async Python functions."""
    print(f"  🔧 Tool: {tool_name}({tool_input})")

    # Coerce string booleans
    if "include_metrics" in tool_input:
        v = tool_input["include_metrics"]
        tool_input["include_metrics"] = v if isinstance(v, bool) else str(v).lower() == "true"

    if tool_name == "get_market_analysis":
        result = await get_market_analysis(**tool_input)
    elif tool_name == "get_portfolio_summary":
        result = await get_portfolio_summary(user_id=user_id, **tool_input)
    elif tool_name == "get_expense_summary":
        result = await get_expense_summary(user_id=user_id, **tool_input)
    elif tool_name == "add_holding":
        result = await add_holding(user_id=user_id, **tool_input)
    else:
        result = {"error": f"Unknown tool: {tool_name}"}

    return json.dumps(result, indent=2)


async def run_agent(user_message: str, conversation_history: list, session_id: str, user_id: str) -> tuple[str, list[str]]:
    """
    Async ReAct agent loop.
    Returns (final_response_text, list_of_tools_called)
    Also saves the exchange to MongoDB.
    """
    from app.db.mongo import save_chat

    conversation_history.append({"role": "user", "content": user_message})
    tools_called: list[str] = []

    while True:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history

        if messages[-1].get("role") == "tool":
            messages.append({
                "role": "user",
                "content": "Now provide your full analysis and recommendation based on the tool results above. Include SITUATION, RECOMMENDATION, RISKS, and NEXT STEP sections.",
            })

        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=2048,
            temperature=0.6,
        )

        message = response.choices[0].message

        if message.tool_calls:
            conversation_history.append({
                "role":       "assistant",
                "content":    message.content,
                "tool_calls": [
                    {
                        "id":       tc.id,
                        "type":     "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in message.tool_calls
                ],
            })

            for tc in message.tool_calls:
                tools_called.append(tc.function.name)
                tool_input = json.loads(tc.function.arguments)
                result     = await execute_tool(tc.function.name, tool_input, user_id)
                conversation_history.append({
                    "role":         "tool",
                    "tool_call_id": tc.id,
                    "content":      result,
                })

        else:
            final_text = message.content or "No response generated."
            conversation_history.append({"role": "assistant", "content": final_text})

            # Save to MongoDB
            await save_chat(session_id, user_message, final_text, tools_called)

            return final_text, tools_called
