from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    secret_key: str = "change-me-in-production"
    dashboard_password: str = ""

    # Database
    database_path: str = "data/pmserver.db"

    # Plaid (Phase 2)
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"

    class Config:
        env_file = ".env"


settings = Settings()
