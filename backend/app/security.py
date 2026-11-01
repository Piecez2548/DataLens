import os


def is_hosted() -> bool:
    """True on Vercel, where unsafe development defaults must fail closed."""
    return bool(os.environ.get("VERCEL"))
