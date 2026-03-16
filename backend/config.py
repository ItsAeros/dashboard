from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    secret_key: str = "change-me-in-production"
    dashboard_username: str = ""
    dashboard_password: str = ""
    totp_secret: str = ""

    # Database
    database_path: str = "data/pmserver.db"


    class Config:
        env_file = ".env"


settings = Settings()
