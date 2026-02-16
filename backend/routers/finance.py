import json
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.auth import require_auth
from backend.database import get_db
from backend.services import plaid_client

router = APIRouter(tags=["finance"], dependencies=[Depends(require_auth)])


# --- Request models ---

class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str = ""


# --- Plaid Link ---

@router.post("/link-token")
def create_link_token():
    """Get a link token to open the Plaid Link widget."""
    token = plaid_client.create_link_token()
    return {"link_token": token}


@router.post("/exchange-token")
def exchange_token(body: ExchangeTokenRequest, db=Depends(get_db)):
    """Exchange a Plaid public token for an access token and save the item."""
    result = plaid_client.exchange_public_token(body.public_token)

    db.execute(
        "INSERT OR REPLACE INTO plaid_items (id, institution_name, access_token) VALUES (?, ?, ?)",
        (result["item_id"], body.institution_name, result["access_token"]),
    )
    db.commit()

    # Immediately fetch accounts for this new item
    _sync_accounts_for_item(db, result["item_id"], result["access_token"], body.institution_name)

    return {"status": "ok", "item_id": result["item_id"]}


# --- Accounts ---

@router.get("/accounts")
def list_accounts(db=Depends(get_db)):
    """List all linked accounts with current balances."""
    rows = db.execute(
        "SELECT * FROM accounts ORDER BY institution_name, name"
    ).fetchall()
    return [dict(row) for row in rows]


# --- Sync ---

@router.post("/sync")
def sync_all(db=Depends(get_db)):
    """Sync accounts and transactions for all linked institutions."""
    items = db.execute("SELECT * FROM plaid_items").fetchall()
    total_added = 0
    total_updated = 0

    for item in items:
        # Refresh account balances
        _sync_accounts_for_item(db, item["id"], item["access_token"], item["institution_name"])

        # Sync transactions incrementally
        result = plaid_client.sync_transactions(item["access_token"], item["cursor"])

        for txn in result["added"]:
            db.execute(
                """INSERT OR IGNORE INTO transactions
                   (id, account_id, amount, date, name, merchant_name, category, pending)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (txn["id"], txn["account_id"], txn["amount"], txn["date"],
                 txn["name"], txn["merchant_name"], txn["category"], txn["pending"]),
            )
            total_added += 1

        for txn in result["modified"]:
            db.execute(
                """UPDATE transactions SET amount=?, date=?, name=?, merchant_name=?,
                   category=?, pending=? WHERE id=?""",
                (txn["amount"], txn["date"], txn["name"], txn["merchant_name"],
                 txn["category"], txn["pending"], txn["id"]),
            )
            total_updated += 1

        for txn_id in result["removed_ids"]:
            db.execute("DELETE FROM transactions WHERE id=?", (txn_id,))

        # Save the new cursor for next incremental sync
        db.execute("UPDATE plaid_items SET cursor=? WHERE id=?", (result["cursor"], item["id"]))
        db.commit()

    return {"status": "ok", "added": total_added, "updated": total_updated}


# --- Transactions ---

@router.get("/transactions")
def list_transactions(
    account_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 500,
    db=Depends(get_db),
):
    """List transactions with optional filters."""
    query = "SELECT * FROM transactions WHERE 1=1"
    params = []

    if account_id:
        query += " AND account_id = ?"
        params.append(account_id)
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)

    query += " ORDER BY date DESC LIMIT ?"
    params.append(min(limit, 1000))

    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]


# --- Summary ---

@router.get("/summary")
def get_summary(db=Depends(get_db)):
    """Financial summary: net worth, spending by category, monthly totals."""
    # Net worth = sum of all account balances
    row = db.execute("SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts").fetchone()
    net_worth = row["total"]

    # Spending by category (last 30 days, positive amounts = money out in Plaid)
    categories = db.execute("""
        SELECT category, SUM(amount) as total
        FROM transactions
        WHERE date >= date('now', '-30 days') AND amount > 0 AND pending = 0
        GROUP BY category
        ORDER BY total DESC
        LIMIT 20
    """).fetchall()

    # Monthly totals (last 6 months)
    monthly = db.execute("""
        SELECT strftime('%Y-%m', date) as month,
               SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spending,
               SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as income
        FROM transactions
        WHERE date >= date('now', '-6 months') AND pending = 0
        GROUP BY month
        ORDER BY month DESC
    """).fetchall()

    return {
        "net_worth": net_worth,
        "spending_by_category": [dict(r) for r in categories],
        "monthly": [dict(r) for r in monthly],
    }


# --- Delete account ---

@router.delete("/accounts/{item_id}")
def delete_item(item_id: str, db=Depends(get_db)):
    """Unlink an institution and remove its accounts/transactions."""
    # Get all account IDs for this item
    accounts = db.execute("SELECT id FROM accounts WHERE plaid_item_id = ?", (item_id,)).fetchall()
    account_ids = [a["id"] for a in accounts]

    if account_ids:
        placeholders = ",".join("?" * len(account_ids))
        db.execute(f"DELETE FROM transactions WHERE account_id IN ({placeholders})", account_ids)

    db.execute("DELETE FROM accounts WHERE plaid_item_id = ?", (item_id,))
    db.execute("DELETE FROM plaid_items WHERE id = ?", (item_id,))
    db.commit()

    return {"status": "ok"}


# --- Helpers ---

def _sync_accounts_for_item(db, item_id: str, access_token: str, institution_name: str):
    """Fetch and upsert accounts for a Plaid item."""
    accounts = plaid_client.get_accounts_with_balances(access_token)
    now = datetime.utcnow().isoformat()

    for acct in accounts:
        db.execute(
            """INSERT OR REPLACE INTO accounts
               (id, plaid_item_id, name, type, subtype, institution_name, mask,
                current_balance, available_balance, currency, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (acct["id"], item_id, acct["name"], acct["type"], acct["subtype"],
             institution_name, acct["mask"], acct["current_balance"],
             acct["available_balance"], acct["currency"], now),
        )
    db.commit()
