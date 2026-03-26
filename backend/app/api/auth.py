from pydantic import BaseModel, EmailStr
from app.core.auth import get_password_hash, verify_password, create_access_token, get_current_user, User
from app.db.mongo import users_col, get_user_income, update_user_income
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, HTTPException, status, Depends

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserSignup(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

class UserSignin(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup")
async def signup(user: UserSignup):
    # Check if user exists
    existing = await users_col().find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = {
        "email": user.email,
        "password": hashed_pwd,
        "full_name": user.full_name
    }
    result = await users_col().insert_one(new_user)
    
    access_token = create_access_token(
        data={"sub": user.email, "user_id": str(result.inserted_id)}
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"email": user.email, "full_name": user.full_name}}

@router.post("/signin")
async def signin(user: UserSignin):
    db_user = await users_col().find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": db_user["email"], "user_id": str(db_user["_id"])}
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"email": db_user["email"], "full_name": db_user.get("full_name")}}

@router.get("/profile")
async def get_profile(current_user: Annotated[User, Depends(get_current_user)]):
    income = await get_user_income(current_user.id)
    return {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "monthly_income": income
    }

class ProfileUpdate(BaseModel):
    monthly_income: float | None = None
    full_name: str | None = None

@router.patch("/profile")
async def update_profile(
    data: ProfileUpdate, 
    current_user: Annotated[User, Depends(get_current_user)]
):
    if data.monthly_income is not None:
        await update_user_income(current_user.id, data.monthly_income)
    
    if data.full_name is not None:
        from bson import ObjectId
        await users_col().update_one(
            {"_id": ObjectId(current_user.id)},
            {"$set": {"full_name": data.full_name}}
        )
    
    return {"status": "updated"}
