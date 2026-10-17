"""Daily forecast from Open-Meteo (no key). Returns None for dates past the 16-day forecast."""

import logging
from datetime import date, timedelta

import httpx

from app.models.api import Weather

log = logging.getLogger("weather")
URL = "https://api.open-meteo.com/v1/forecast"
SAN_DIEGO = (32.7157, -117.1611)


def forecast(start: date, nights: int, today: date | None = None) -> list[Weather | None]:
    days = [start + timedelta(days=i) for i in range(nights)]
    today = today or date.today()
    if days[0] > today + timedelta(days=15):
        return [None] * nights
    try:
        response = httpx.get(
            URL,
            params={
                "latitude": SAN_DIEGO[0],
                "longitude": SAN_DIEGO[1],
                "daily": "temperature_2m_max,precipitation_probability_max,uv_index_max",
                "temperature_unit": "fahrenheit",
                "timezone": "America/Los_Angeles",
                "start_date": days[0].isoformat(),
                "end_date": min(days[-1], today + timedelta(days=15)).isoformat(),
            },
            timeout=5,
        )
        response.raise_for_status()
        daily = response.json()["daily"]
    except (httpx.HTTPError, KeyError, ValueError) as error:
        log.warning("weather unavailable: %s", error)
        return [None] * nights
    by_day = {
        d: (t, p, u)
        for d, t, p, u in zip(
            daily["time"],
            daily["temperature_2m_max"],
            daily["precipitation_probability_max"],
            daily["uv_index_max"],
            strict=False,
        )
    }
    result: list[Weather | None] = []
    for d in days:
        values = by_day.get(d.isoformat())
        if not values or None in values:
            result.append(None)
            continue
        tmax, precip, uv = values
        advisory = None
        if tmax >= 85 or uv >= 8:
            advisory = "Hot or strong sun: outdoor stops are in the morning."
        elif precip >= 50:
            advisory = "Rain is likely: indoor stops are better today."
        result.append(Weather(tmax_f=tmax, precip_prob=int(precip), uv_max=uv, advisory=advisory))
    return result


def is_hot(weather: Weather | None) -> bool:
    return weather is not None and (weather.tmax_f >= 85 or weather.uv_max >= 8)
