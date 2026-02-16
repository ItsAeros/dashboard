import plaid
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.products import Products

from backend.config import settings


def _get_client() -> plaid_api.PlaidApi:
    """Create a Plaid API client from settings."""
    host = {
        "sandbox": plaid.Environment.Sandbox,
        "development": plaid.Environment.Development,
        "production": plaid.Environment.Production,
    }.get(settings.plaid_env, plaid.Environment.Sandbox)

    configuration = plaid.Configuration(
        host=host,
        api_key={"clientId": settings.plaid_client_id, "secret": settings.plaid_secret},
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def create_link_token() -> str:
    """Create a link token for the Plaid Link frontend widget."""
    client = _get_client()
    request = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id="pmserver-user"),
        client_name="pmserver",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en",
    )
    response = client.link_token_create(request)
    return response.link_token


def exchange_public_token(public_token: str) -> dict:
    """Exchange a public token from Plaid Link for a permanent access token."""
    client = _get_client()
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return {
        "access_token": response.access_token,
        "item_id": response.item_id,
    }


def get_accounts_with_balances(access_token: str) -> list[dict]:
    """Fetch all accounts and their current balances."""
    client = _get_client()
    request = AccountsBalanceGetRequest(access_token=access_token)
    response = client.accounts_balance_get(request)
    return [
        {
            "id": a.account_id,
            "name": a.name,
            "type": a.type.value,
            "subtype": a.subtype.value if a.subtype else None,
            "mask": a.mask,
            "current_balance": a.balances.current,
            "available_balance": a.balances.available,
            "currency": a.balances.iso_currency_code or "USD",
        }
        for a in response.accounts
    ]


def sync_transactions(access_token: str, cursor: str | None = None) -> dict:
    """Incrementally sync transactions. Returns added/modified/removed + new cursor."""
    client = _get_client()
    all_added = []
    all_modified = []
    all_removed = []
    has_more = True

    while has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            **({"cursor": cursor} if cursor else {}),
        )
        response = client.transactions_sync(request)

        all_added.extend(response.added)
        all_modified.extend(response.modified)
        all_removed.extend(response.removed)
        cursor = response.next_cursor
        has_more = response.has_more

    return {
        "added": [
            {
                "id": t.transaction_id,
                "account_id": t.account_id,
                "amount": t.amount,
                "date": str(t.date),
                "name": t.name,
                "merchant_name": t.merchant_name,
                "category": ",".join(t.category) if t.category else None,
                "pending": t.pending,
            }
            for t in all_added
        ],
        "modified": [
            {
                "id": t.transaction_id,
                "account_id": t.account_id,
                "amount": t.amount,
                "date": str(t.date),
                "name": t.name,
                "merchant_name": t.merchant_name,
                "category": ",".join(t.category) if t.category else None,
                "pending": t.pending,
            }
            for t in all_modified
        ],
        "removed_ids": [t.transaction_id for t in all_removed],
        "cursor": cursor,
    }
