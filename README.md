# Weatherly

A modern, responsive weather dashboard built with Flask and the OpenWeather API. Weatherly provides real-time weather information, a 5-day forecast, air quality data, adaptive themes, live local time, favorite cities, recent searches, and weather-based visual atmospheres.

## Features

### Real-Time Weather

- Search for weather by city name.
- Displays current temperature and weather condition.
- Shows feels-like temperature.
- Displays humidity, wind speed, pressure, and visibility.
- Uses live data from the OpenWeather API.

### 5-Day Forecast

- Displays upcoming daily weather conditions.
- Shows forecast temperatures and weather icons.
- Automatically updates when a different city is searched.

### Sunrise & Sunset

- Displays local sunrise and sunset times for the searched location.
- Uses location-specific timezone information from OpenWeather.

### Live Local Time

- Displays the current local time of the searched city.
- Updates every second without repeatedly calling the weather API.
- Handles timezone differences and date rollovers.
- Displays the UTC offset for the selected location.

### Adaptive Themes

Weatherly automatically adapts its appearance according to the searched city's local time.

Supported modes include:

- Morning
- Day
- Evening
- Night
- Light
- Dark
- AUTO

AUTO mode uses the searched location's timezone, sunrise, and sunset information to determine the appropriate time-based theme.

### Favorite Cities

- Save frequently used cities as favorites.
- Remove cities from favorites.
- Click a favorite city to load its weather instantly.
- Favorites persist across browser sessions using `localStorage`.
- Duplicate cities are prevented.

### Recent Searches

- Automatically stores successful city searches.
- Keeps the five most recent searches.
- Re-searching a city moves it to the top instead of creating a duplicate.
- Quickly load a previous search.
- Clear recent searches independently from favorites.

### Celsius / Fahrenheit

- Switch between Celsius (°C) and Fahrenheit (°F).
- Updates current temperature, feels-like temperature, and forecast temperatures instantly.
- Uses frontend conversion without making additional weather API requests.
- Preserves original API temperature values to prevent conversion drift.
- Remembers the selected unit using `localStorage`.

### Air Quality

Weatherly integrates the OpenWeather Air Pollution API to display:

- Air Quality Index (AQI)
- AQI category
- PM2.5
- PM10
- NO₂
- O₃
- CO
- SO₂

The AQI scale is displayed using OpenWeather's values:

| AQI | Category |
| --- | --- |
| 1 | Good |
| 2 | Fair |
| 3 | Moderate |
| 4 | Poor |
| 5 | Very Poor |

Air quality requests are handled securely through the Flask backend.

### Weather Alerts

Weatherly includes support for OpenWeather weather alerts through the One Call API.

When alert data is available, the application can display:

- Alert event
- Description
- Start time
- End time
- Issuing authority
- Available alert tags

If the configured OpenWeather plan does not provide alert access, Weatherly gracefully displays an informative unavailable state instead of generating fake alerts.

### Weather-Based Atmospheres

The dashboard visually adapts to the current weather condition while preserving the existing time-based theme.

Supported conditions include:

- Clear
- Clouds
- Rain
- Drizzle
- Thunderstorm
- Snow
- Mist
- Fog
- Haze
- Smoke
- Dust
- Sand
- Ash
- Squall
- Tornado

Atmospheric effects are implemented using lightweight CSS gradients and animations.

The application does not use external background images, videos, or third-party weather animation libraries.

### Responsive Design

Weatherly is designed to work across:

- Desktop
- Laptop
- Tablet
- Mobile

The layout adapts automatically to different screen sizes while maintaining readable weather information and accessible controls.

### Accessibility & Performance

- Semantic HTML controls
- Accessible labels and ARIA attributes
- Keyboard-friendly controls
- Visible focus states
- `prefers-reduced-motion` support
- Lightweight CSS-based weather effects
- No JavaScript animation loops
- No unnecessary API requests
- Stale-response protection for asynchronous requests

### Security

- OpenWeather API credentials are stored in `.env`.
- API calls are handled through the Flask backend.
- API credentials are never exposed to frontend JavaScript.
- `.env` is excluded from Git using `.gitignore`.
- Frontend communicates with local Flask `/api/*` routes instead of directly exposing the API key.

## Technologies

- **Python**
- **Flask**
- **Requests**
- **python-dotenv**
- **HTML5**
- **CSS3**
- **JavaScript (ES6+)**
- **OpenWeather API**
- **Browser localStorage**
- **Git & GitHub**

## Project Structure

```text
Weatherly/
│
├── app.py
├── requirements.txt
├── .env
├── .gitignore
├── README.md
│
├── templates/
│   └── index.html
│
└── static/
    ├── style.css
    └── script.js

How It Works
Architecture Flow
User enters city / clicks favorite / clicks recent
       ↓
Frontend requests /api/weather?city=<city>
       ↓
Flask securely queries OpenWeather API
       ↓
Flask parses & returns coordinates, current weather, local timezone
       ↓
Frontend triggers parallel requests:
       ├── /api/forecast?city=<city>
       ├── /api/air-quality?lat=<lat>&lon=<lon>
       └── /api/alerts?lat=<lat>&lon=<lon>
       ↓
Dashboard updates dynamically:
       ├── Time-based theme & live clock start
       ├── Weather-based atmospheric layer adapts
       ├── Air quality & alert cards render
       └── Unit conversions apply instantly

Live Local Clock Logic
The live local clock uses the location-specific timezone offset returned by OpenWeather rather than the client computer's local timezone.
The frontend calculates the searched city's current time using the returned UTC offset and updates the clock every second without making repetitive network calls.
When a new city is searched, the previous clock interval is cleared so multiple timers never run concurrently.
Setup & Installation
1. Clone or Download the Project
If using Git:
git clone <your-github-repository-url>
cd Weatherly

Or navigate directly to the project directory:
cd Weatherly

2. Create and Activate a Virtual Environment
python -m venv .venv

Windows PowerShell:
.venv\Scripts\Activate.ps1

Windows Command Prompt:
.venv\Scripts\activate

3. Install Dependencies
pip install -r requirements.txt

4. Create and Configure .env
Create a .env file in the project root:
OPENWEATHER_API_KEY=your_api_key_here

Security Warning
- Never commit your .env file to GitHub or any public repository.
- Never expose your API key in frontend code or client-side files.

5. Run the Application
python app.py

6. Open in Browser
Open:
http://127.0.0.1:5000

OpenWeather API Setup
To obtain an API key:
1. Visit the official OpenWeather website.
2. Sign up for a free account or log in.
3. Navigate to the API Keys section.
4. Copy your API key.
5. Add it to your .env file as OPENWEATHER_API_KEY.
Testing & Verification
Weatherly was tested using live OpenWeather API responses with multiple locations:
City	Country	Timezone Offset	Verified Behavior
Cuddalore	IN	UTC+5:30	Local time, air quality, and weather atmosphere
Chennai	IN	UTC+5:30	Weather, 5-day forecast, AQI, and alert fallback
London	GB	UTC+1	Cloud atmosphere, forecast, and local time
Tokyo	JP	UTC+9	Date rollover, unit conversion, and night atmosphere
New York	US	UTC-4	Responsive dashboard and live local time
Reykjavik	IS	UTC+0	Cloud atmosphere and air quality


Testing covered:
- Current weather
- 5-day forecast
- Invalid city handling
- Loading and error states
- Timezone calculations
- Date rollover
- Favorite cities
- Recent searches
- Celsius/Fahrenheit conversion
- Air quality
- AQI mapping
- Weather alert handling
- Weather-based atmospheres
- Responsive layouts
- Theme switching
- Reduced-motion accessibility
- API credential security
- Stale-response protection
- Session caching
Known Limitations
- Official weather alerts require access to the appropriate OpenWeather One Call service.
- Weather and air quality accuracy depends on OpenWeather data availability.
- Air quality information may vary by location.
- Weather-based atmospheres are intentionally lightweight and are not intended to simulate real weather conditions.
Future Improvements
- Weather history and trends
- Interactive weather charts
- UV index information
- Weather notifications
- Progressive Web App support
- Cross-device synchronization for saved cities

Author
Safwa M.
Computer Science Engineering
Internship Project