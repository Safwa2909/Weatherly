import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify
import requests
from dotenv import load_dotenv

# -----------------------------------------------------------------------------
# Environment Variable Loading
# -----------------------------------------------------------------------------
# Load environment variables from the local .env file
load_dotenv()

app = Flask(__name__)

# OpenWeather API endpoints
OPENWEATHER_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
OPENWEATHER_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
OPENWEATHER_AIR_POLLUTION_URL = "https://api.openweathermap.org/data/2.5/air_pollution"
OPENWEATHER_ONECALL_URL = "https://api.openweathermap.org/data/3.0/onecall"

AQI_CATEGORY_MAP = {
    1: "Good",
    2: "Fair",
    3: "Moderate",
    4: "Poor",
    5: "Very Poor"
}


def get_api_key():
    """Retrieve and validate the OpenWeather API key from the environment."""
    load_dotenv(override=True)
    key = os.getenv("OPENWEATHER_API_KEY")
    if not key or key.strip() == "" or key.strip() == "your_api_key_here":
        return None
    return key.strip()


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    """Render the main Weatherly homepage."""
    return render_template("index.html")


@app.route("/api/weather")
def get_current_weather():
    """
    Fetch real-time current weather for a specified city from OpenWeather API.
    Query param: city (string)
    """
    city = request.args.get("city", "").strip()

    # 1. Validation: Check for empty city
    if not city:
        return jsonify({
            "error": "City name is required.",
            "message": "Please enter a city name to search."
        }), 400

    # 2. Validation: Check API key configuration
    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "error": "API key not configured.",
            "message": "OpenWeather API key is missing. Please add OPENWEATHER_API_KEY to your .env file."
        }), 500

    # 3. API Request to OpenWeather Current Weather endpoint
    params = {
        "q": city,
        "appid": api_key,
        "units": "metric"
    }

    try:
        response = requests.get(OPENWEATHER_WEATHER_URL, params=params, timeout=10)
    except requests.exceptions.Timeout:
        return jsonify({
            "error": "Request timed out.",
            "message": "The weather service took too long to respond. Please try again."
        }), 504
    except requests.exceptions.RequestException:
        return jsonify({
            "error": "Network error.",
            "message": "Could not connect to the weather service. Please check your internet connection."
        }), 503

    # 4. Handle HTTP status codes from OpenWeather
    if response.status_code == 404:
        return jsonify({
            "error": "City not found.",
            "message": "Couldn't find that city. Please check the spelling and try again."
        }), 404
    elif response.status_code == 401:
        return jsonify({
            "error": "Unauthorized.",
            "message": "Invalid OpenWeather API key. Please verify your credentials."
        }), 401
    elif response.status_code != 200:
        return jsonify({
            "error": "Weather service error.",
            "message": "Weather service returned an unexpected response. Please try again later."
        }), response.status_code

    # 5. JSON Parsing and Data Extraction
    try:
        data = response.json()
        weather_list = data.get("weather", [])
        weather_primary = weather_list[0] if weather_list else {}

        parsed_data = {
            "city": data.get("name", city),
            "country": data.get("sys", {}).get("country", ""),
            "temperature": round(data.get("main", {}).get("temp", 0)),
            "feels_like": round(data.get("main", {}).get("feels_like", 0)),
            "humidity": data.get("main", {}).get("humidity", 0),
            "pressure": data.get("main", {}).get("pressure", 0),
            "wind_speed": round(data.get("wind", {}).get("speed", 0), 1),
            "visibility": data.get("visibility", 0),  # In meters
            "weather_main": weather_primary.get("main", ""),
            "weather_description": weather_primary.get("description", "").title(),
            "weather_icon": weather_primary.get("icon", "01d"),
            "sunrise": data.get("sys", {}).get("sunrise"),
            "sunset": data.get("sys", {}).get("sunset"),
            "timezone": data.get("timezone", 0),  # Timezone offset in seconds
            "dt": data.get("dt"),  # Calculation timestamp in UTC seconds
            "coordinates": {
                "lat": data.get("coord", {}).get("lat"),
                "lon": data.get("coord", {}).get("lon")
            }
        }

        return jsonify(parsed_data), 200

    except Exception:
        return jsonify({
            "error": "Data parsing error.",
            "message": "Could not process weather data from the provider."
        }), 500


@app.route("/api/forecast")
def get_forecast():
    """
    Fetch 5-day / 3-hour forecast and simplify it into daily forecast cards.
    Query param: city (string)
    """
    city = request.args.get("city", "").strip()

    # 1. Validation: Check for empty city
    if not city:
        return jsonify({
            "error": "City name is required.",
            "message": "Please enter a city name to search."
        }), 400

    # 2. Validation: Check API key configuration
    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "error": "API key not configured.",
            "message": "OpenWeather API key is missing. Please add OPENWEATHER_API_KEY to your .env file."
        }), 500

    # 3. API Request to OpenWeather 5-day Forecast endpoint
    params = {
        "q": city,
        "appid": api_key,
        "units": "metric"
    }

    try:
        response = requests.get(OPENWEATHER_FORECAST_URL, params=params, timeout=10)
    except requests.exceptions.Timeout:
        return jsonify({
            "error": "Request timed out.",
            "message": "The forecast service took too long to respond. Please try again."
        }), 504
    except requests.exceptions.RequestException:
        return jsonify({
            "error": "Network error.",
            "message": "Could not connect to the forecast service. Please check your internet connection."
        }), 503

    # 4. Handle HTTP status codes from OpenWeather
    if response.status_code == 404:
        return jsonify({
            "error": "City not found.",
            "message": "Couldn't find forecast for that city."
        }), 404
    elif response.status_code == 401:
        return jsonify({
            "error": "Unauthorized.",
            "message": "Invalid OpenWeather API key. Please verify your credentials."
        }), 401
    elif response.status_code != 200:
        return jsonify({
            "error": "Forecast service error.",
            "message": "Forecast service returned an unexpected response."
        }), response.status_code

    # 5. JSON Parsing: Simplify 3-hour intervals into 5 daily summaries
    try:
        data = response.json()
        forecast_list = data.get("list", [])
        city_timezone = data.get("city", {}).get("timezone", 0)

        # Group forecast items by calendar date
        daily_groups = {}
        for item in forecast_list:
            dt_txt = item.get("dt_txt", "")  # Format: "YYYY-MM-DD HH:MM:SS"
            if not dt_txt:
                continue
            date_str = dt_txt.split(" ")[0]

            if date_str not in daily_groups:
                daily_groups[date_str] = []
            daily_groups[date_str].append(item)

        simplified_forecast = []

        # Iterate over distinct dates and pick a midday entry (around 12:00 / closest to noon)
        for date_str, items in daily_groups.items():
            # Pick the entry closest to 12:00:00 noon, or the middle item
            selected_item = min(
                items,
                key=lambda x: abs(int(x.get("dt_txt", " 12").split(" ")[1].split(":")[0]) - 12)
            )

            weather_list = selected_item.get("weather", [])
            weather_primary = weather_list[0] if weather_list else {}

            # Calculate min and max temperatures for that entire day
            temps = [x.get("main", {}).get("temp") for x in items if x.get("main", {}).get("temp") is not None]
            min_temp = round(min(temps)) if temps else round(selected_item.get("main", {}).get("temp", 0))
            max_temp = round(max(temps)) if temps else round(selected_item.get("main", {}).get("temp", 0))

            simplified_forecast.append({
                "date": date_str,
                "timestamp": selected_item.get("dt"),
                "temperature": round(selected_item.get("main", {}).get("temp", 0)),
                "temp_min": min_temp,
                "temp_max": max_temp,
                "weather_main": weather_primary.get("main", ""),
                "weather_description": weather_primary.get("description", "").title(),
                "weather_icon": weather_primary.get("icon", "01d")
            })

            # Limit to 5 consecutive days
            if len(simplified_forecast) == 5:
                break

        return jsonify({
            "city": data.get("city", {}).get("name", city),
            "country": data.get("city", {}).get("country", ""),
            "forecast": simplified_forecast
        }), 200

    except Exception:
        return jsonify({
            "error": "Data parsing error.",
            "message": "Could not process forecast data from the provider."
        }), 500


@app.route("/api/air-quality")
def get_air_quality():
    """
    Fetch real-time air pollution data for given coordinates from OpenWeather Air Pollution API.
    Query params: lat (float), lon (float)
    """
    lat_str = request.args.get("lat", "").strip()
    lon_str = request.args.get("lon", "").strip()

    if not lat_str or not lon_str:
        return jsonify({
            "error": "Coordinates required.",
            "message": "Both latitude and longitude parameters are required."
        }), 400

    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        return jsonify({
            "error": "Invalid coordinates.",
            "message": "Latitude and longitude must be valid numeric values."
        }), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "error": "API key not configured.",
            "message": "OpenWeather API key is missing. Please add OPENWEATHER_API_KEY to your .env file."
        }), 500

    params = {
        "lat": lat,
        "lon": lon,
        "appid": api_key
    }

    try:
        response = requests.get(OPENWEATHER_AIR_POLLUTION_URL, params=params, timeout=10)
    except requests.exceptions.Timeout:
        return jsonify({
            "error": "Request timed out.",
            "message": "The air quality service took too long to respond. Please try again."
        }), 504
    except requests.exceptions.RequestException:
        return jsonify({
            "error": "Network error.",
            "message": "Could not connect to the air quality service. Please check your internet connection."
        }), 503

    if response.status_code != 200:
        return jsonify({
            "error": "Air quality service error.",
            "message": "Air quality service returned an unexpected response."
        }), response.status_code

    try:
        data = response.json()
        items = data.get("list", [])
        if not items:
            return jsonify({
                "error": "No data found.",
                "message": "Air quality data is currently unavailable for these coordinates."
            }), 404

        first_entry = items[0]
        aqi_val = first_entry.get("main", {}).get("aqi", 1)
        components = first_entry.get("components", {})

        return jsonify({
            "aqi": aqi_val,
            "category": AQI_CATEGORY_MAP.get(aqi_val, "Moderate"),
            "pollutants": {
                "pm2_5": components.get("pm2_5"),
                "pm10": components.get("pm10"),
                "no2": components.get("no2"),
                "o3": components.get("o3"),
                "co": components.get("co"),
                "so2": components.get("so2")
            }
        }), 200

    except Exception:
        return jsonify({
            "error": "Data parsing error.",
            "message": "Could not process air quality data from the provider."
        }), 500


@app.route("/api/alerts")
def get_weather_alerts():
    """
    Fetch government weather alerts and warnings for given coordinates from OpenWeather One Call 3.0 API.
    Query params: lat (float), lon (float)
    """
    lat_str = request.args.get("lat", "").strip()
    lon_str = request.args.get("lon", "").strip()

    if not lat_str or not lon_str:
        return jsonify({
            "error": "Coordinates required.",
            "message": "Both latitude and longitude parameters are required."
        }), 400

    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        return jsonify({
            "error": "Invalid coordinates.",
            "message": "Latitude and longitude must be valid numeric values."
        }), 400

    # Validate coordinate ranges (-90 to 90 for lat, -180 to 180 for lon)
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
        return jsonify({
            "error": "Coordinates out of bounds.",
            "message": "Latitude must be between -90 and 90, and longitude between -180 and 180."
        }), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "error": "API key not configured.",
            "message": "OpenWeather API key is missing. Please add OPENWEATHER_API_KEY to your .env file."
        }), 500

    params = {
        "lat": lat,
        "lon": lon,
        "appid": api_key,
        "exclude": "current,minutely,hourly,daily"
    }

    try:
        response = requests.get(OPENWEATHER_ONECALL_URL, params=params, timeout=10)
    except requests.exceptions.Timeout:
        return jsonify({
            "status": "error",
            "available": False,
            "alerts": [],
            "message": "Weather alerts service timed out."
        }), 504
    except requests.exceptions.RequestException:
        return jsonify({
            "status": "error",
            "available": False,
            "alerts": [],
            "message": "Could not connect to weather alerts service."
        }), 503

    # If the user's OpenWeather subscription plan does not grant access to One Call 3.0 (401/403/404)
    # or the service reports an unavailable subscription tier:
    if response.status_code in (401, 403, 404):
        return jsonify({
            "status": "unavailable",
            "available": False,
            "alerts": [],
            "message": "Weather alerts are not available for this location."
        }), 200

    if response.status_code != 200:
        return jsonify({
            "status": "error",
            "available": False,
            "alerts": [],
            "message": "Weather alerts service returned an unexpected response."
        }), response.status_code

    try:
        data = response.json()
        raw_alerts = data.get("alerts", [])
        timezone_offset = data.get("timezone_offset", 0)

        # No active alerts reported for this location
        if not raw_alerts:
            return jsonify({
                "status": "none",
                "available": True,
                "alerts": [],
                "message": "No active weather alerts"
            }), 200

        # Active alerts available - extract only real fields provided by the API
        parsed_alerts = []
        for alert in raw_alerts:
            parsed_alerts.append({
                "event": alert.get("event") or "Weather Alert",
                "description": alert.get("description") or "",
                "start": alert.get("start"),
                "end": alert.get("end"),
                "sender_name": alert.get("sender_name") or "",
                "tags": alert.get("tags") or []
            })

        return jsonify({
            "status": "active",
            "available": True,
            "alerts": parsed_alerts,
            "timezone_offset": timezone_offset
        }), 200

    except Exception:
        return jsonify({
            "status": "error",
            "available": False,
            "alerts": [],
            "message": "Could not process weather alerts data."
        }), 500


# -----------------------------------------------------------------------------
# Main Application Execution
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)
