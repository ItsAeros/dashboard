#!/usr/bin/env python3
"""Generate a TOTP secret for 2FA login.

Run once, then:
  1. Copy the secret into your .env as TOTP_SECRET=<secret>
  2. Scan the otpauth URI (or QR code) in your authenticator app
"""

import pyotp

secret = pyotp.random_base32()
uri = pyotp.TOTP(secret).provisioning_uri(name="admin", issuer_name="pmserver")

print("TOTP Secret:", secret)
print()
print("Add this to your .env:")
print(f"  TOTP_SECRET={secret}")
print()
print("otpauth URI (paste into authenticator app or generate a QR code):")
print(f"  {uri}")
