/**
 * Weatherly - Frontend JavaScript
 * Connects the UI to Flask backend endpoints (/api/weather and /api/forecast),
 * handles conversions, state management, DOM rendering, and the automatic time-aware theme system.
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // Configurable Theme Rules
    // -------------------------------------------------------------------------
    const THEME_CONFIG = {
        morningEndHour: 11,            // Sunrise until 11:00 local time -> Morning
        eveningHoursBeforeSunset: 2     // 2 hours before sunset until sunset -> Evening
    };

    // Theme Mode State: 'auto' | 'light' | 'dark'
    let currentThemeMode = 'auto';
    let lastFetchedWeatherData = null;
    let lastFetchedForecastData = null;

    // Temperature Unit State: 'celsius' | 'fahrenheit' (default: 'celsius')
    let currentTemperatureUnit = 'celsius';

    // Toggle DOM Elements
    const themeButtons = document.querySelectorAll('.theme-btn');
    const unitButtons = document.querySelectorAll('.unit-btn');
    const themeIndicatorBadge = document.getElementById('theme-indicator-badge');

    // Search Form & Input Elements
    const searchForm = document.getElementById('search-form');
    const cityInput = document.getElementById('city-input');
    const searchBtn = document.getElementById('search-btn');

    // UI State Panels
    const initialState = document.getElementById('initial-state');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorTitle = document.getElementById('error-title');
    const errorDetail = document.getElementById('error-detail');
    const weatherDashboard = document.getElementById('weather-dashboard');

    // Current Weather Elements
    const currentCity = document.getElementById('current-city');
    const currentCountry = document.getElementById('current-country');
    const lastUpdatedBadge = document.getElementById('last-updated-badge');
    const localTimeCard = document.getElementById('local-time-card');
    const localTimeClock = document.getElementById('local-time-clock');
    const localTimezoneBadge = document.getElementById('local-timezone-badge');
    const localDateString = document.getElementById('local-date-string');
    let clockIntervalId = null;
    const currentTemp = document.getElementById('current-temp');
    const feelsLike = document.getElementById('feels-like');
    const weatherIconWrapper = document.getElementById('weather-icon-wrapper');
    const weatherCondition = document.getElementById('weather-condition');
    const weatherDescription = document.getElementById('weather-description');

    // Weather Metrics Elements
    const metricHumidity = document.getElementById('metric-humidity');
    const metricWind = document.getElementById('metric-wind');
    const metricPressure = document.getElementById('metric-pressure');
    const metricVisibility = document.getElementById('metric-visibility');

    // Sun Information Elements
    const metricSunrise = document.getElementById('metric-sunrise');
    const metricSunset = document.getElementById('metric-sunset');

    // Forecast Grid Container
    const forecastCardsContainer = document.getElementById('forecast-cards-container');

    // -------------------------------------------------------------------------
    // Favorites & Recent Searches Configuration & State
    // -------------------------------------------------------------------------
    const STORAGE_KEYS = {
        favorites: 'weatherly_favorite_cities',
        recentSearches: 'weatherly_recent_searches',
        temperatureUnit: 'weatherly_temperature_unit'
    };
    const MAX_RECENT_SEARCHES = 5;

    // Quick Access DOM Elements
    const favoritesList = document.getElementById('favorites-list');
    const favoritesCountBadge = document.getElementById('favorites-count-badge');
    const recentList = document.getElementById('recent-list');
    const recentCountBadge = document.getElementById('recent-count-badge');
    const clearRecentBtn = document.getElementById('clear-recent-btn');
    const favoriteToggleBtn = document.getElementById('favorite-toggle-btn');
    const favoriteBtnText = document.getElementById('favorite-btn-text');

    // Air Quality DOM Elements
    const aqiIndicator = document.getElementById('aqi-indicator');
    const aqiValue = document.getElementById('aqi-value');
    const aqiCategory = document.getElementById('aqi-category');
    const airQualityLoading = document.getElementById('air-quality-loading');
    const airQualityError = document.getElementById('air-quality-error');
    const airQualityErrorText = document.getElementById('air-quality-error-text');
    const pollutantsGrid = document.getElementById('pollutants-grid');
    const pollutantPm25 = document.getElementById('pollutant-pm25');
    const pollutantPm10 = document.getElementById('pollutant-pm10');
    const pollutantNo2 = document.getElementById('pollutant-no2');
    const pollutantO3 = document.getElementById('pollutant-o3');
    const pollutantCo = document.getElementById('pollutant-co');
    const pollutantSo2 = document.getElementById('pollutant-so2');

    // Air Quality State & Session Cache
    let currentAirQualityRequestId = 0;
    const airQualitySessionCache = new Map();
    const AQI_CATEGORIES = {
        1: 'Good',
        2: 'Fair',
        3: 'Moderate',
        4: 'Poor',
        5: 'Very Poor'
    };

    // Weather Alerts DOM Elements
    const alertsContainer = document.getElementById('alerts-container');
    const alertsStatusIcon = document.getElementById('alerts-status-icon');
    const alertsHeading = document.getElementById('alerts-heading');
    const alertsSubtitle = document.getElementById('alerts-subtitle');
    const alertsCountBadge = document.getElementById('alerts-count-badge');
    const alertsLoading = document.getElementById('alerts-loading');
    const alertsList = document.getElementById('alerts-list');

    // Weather Alerts State & Session Cache
    let currentAlertsRequestId = 0;
    const alertsSessionCache = new Map();

    // -------------------------------------------------------------------------
    // Theme System Implementation
    // -------------------------------------------------------------------------

    /**
     * Determine theme based on searched city's local sunrise, sunset, and timezone
     * @param {Object} weatherData
     * @returns {{ themeClass: string, label: string }}
     */
    function calculateCityTheme(weatherData) {
        if (!weatherData || !weatherData.sunrise || !weatherData.sunset) {
            return { themeClass: 'theme-day', label: '☀️ Day' };
        }

        const currentUtc = weatherData.dt || Math.floor(Date.now() / 1000);
        const { sunrise, sunset, timezone = 0 } = weatherData;

        // 1. Before sunrise or after sunset -> Night
        if (currentUtc < sunrise || currentUtc > sunset) {
            return { themeClass: 'theme-night', label: '🌙 Night' };
        }

        // 2. Approximately 2 hours before sunset until sunset -> Evening
        const eveningThresholdSeconds = THEME_CONFIG.eveningHoursBeforeSunset * 3600;
        if (currentUtc >= (sunset - eveningThresholdSeconds) && currentUtc <= sunset) {
            return { themeClass: 'theme-evening', label: '🌇 Evening' };
        }

        // 3. Sunrise until 11:00 local time -> Morning
        const localDate = new Date((currentUtc + timezone) * 1000);
        const localHour = localDate.getUTCHours() + (localDate.getUTCMinutes() / 60);
        if (localHour < THEME_CONFIG.morningEndHour) {
            return { themeClass: 'theme-morning', label: '🌅 Morning' };
        }

        // 4. Default Day
        return { themeClass: 'theme-day', label: '☀️ Day' };
    }

    /**
     * Apply the specified theme class and indicator label to the document
     * @param {string} themeClass
     * @param {string} label
     */
    function applyTheme(themeClass, label) {
        document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
        document.body.classList.add(themeClass);

        if (themeIndicatorBadge) {
            themeIndicatorBadge.textContent = label;
        }
    }

    /**
     * Re-evaluate and apply theme according to current mode (auto, light, dark)
     */
    function updateTheme() {
        if (currentThemeMode === 'light') {
            applyTheme('theme-day', '☀️ Light');
        } else if (currentThemeMode === 'dark') {
            applyTheme('theme-night', '🌙 Dark');
        } else {
            // AUTO Mode: calculate based on searched city's local time
            if (lastFetchedWeatherData) {
                const { themeClass, label } = calculateCityTheme(lastFetchedWeatherData);
                applyTheme(themeClass, label);
            } else {
                applyTheme('theme-day', '☀️ Day');
            }
        }
    }

    // Theme Toggle Controls Handler
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.themeMode;
            currentThemeMode = mode;

            themeButtons.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });

            updateTheme();
        });
    });

    // -------------------------------------------------------------------------
    // Weather-Based Atmospheric Overlay System
    // -------------------------------------------------------------------------
    const ALL_ATMOSPHERE_CLASSES = [
        'weather-clear',
        'weather-clouds',
        'weather-rain',
        'weather-drizzle',
        'weather-thunderstorm',
        'weather-snow',
        'weather-mist',
        'weather-stormy',
        'weather-neutral'
    ];

    /**
     * Map OpenWeather weather_main and description to an atmospheric condition class
     * @param {string} weatherMain - e.g. "Clear", "Clouds", "Rain", "Snow", etc.
     * @param {string} weatherDescription - e.g. "scattered clouds", "heavy intensity rain"
     * @returns {{ className: string, intensity: string }}
     */
    function normalizeWeatherCondition(weatherMain, weatherDescription = '') {
        const main = (weatherMain || '').trim().toLowerCase();
        const desc = (weatherDescription || '').trim().toLowerCase();

        // 1. Clear sky
        if (main === 'clear') {
            return { className: 'weather-clear', intensity: 'normal' };
        }

        // 2. Cloud cover
        if (main === 'clouds') {
            let intensity = 'scattered';
            if (desc.includes('few') || desc.includes('scattered')) {
                intensity = 'light';
            } else if (desc.includes('overcast') || desc.includes('broken')) {
                intensity = 'overcast';
            }
            return { className: 'weather-clouds', intensity };
        }

        // 3. Rain & showers
        if (main === 'rain') {
            return { className: 'weather-rain', intensity: desc.includes('light') ? 'light' : 'moderate' };
        }

        // 4. Drizzle
        if (main === 'drizzle') {
            return { className: 'weather-drizzle', intensity: 'light' };
        }

        // 5. Thunderstorm
        if (main === 'thunderstorm') {
            return { className: 'weather-thunderstorm', intensity: 'storm' };
        }

        // 6. Snow
        if (main === 'snow') {
            return { className: 'weather-snow', intensity: 'normal' };
        }

        // 7. Atmospheric conditions (Mist, Fog, Haze, Smoke, Dust, Sand, Ash)
        if (['mist', 'fog', 'haze', 'smoke', 'dust', 'sand', 'ash'].includes(main)) {
            return { className: 'weather-mist', intensity: 'haze' };
        }

        // 8. Squall or Tornado
        if (['squall', 'tornado'].includes(main)) {
            return { className: 'weather-stormy', intensity: 'heavy' };
        }

        // 9. Neutral / Fallback
        return { className: 'weather-neutral', intensity: 'normal' };
    }

    /**
     * Apply subtle weather atmosphere layer to document.body, preserving base theme
     * @param {string} weatherMain
     * @param {string} weatherDescription
     */
    function applyWeatherAtmosphere(weatherMain, weatherDescription = '') {
        const { className, intensity } = normalizeWeatherCondition(weatherMain, weatherDescription);

        // Remove previous atmosphere classes from body
        ALL_ATMOSPHERE_CLASSES.forEach(cls => {
            document.body.classList.remove(cls);
        });

        // Apply new atmosphere class
        document.body.classList.add(className);

        // Update cloud intensity attribute if applicable
        if (className === 'weather-clouds') {
            document.body.setAttribute('data-cloud-intensity', intensity);
        } else {
            document.body.removeAttribute('data-cloud-intensity');
        }
    }

    // -------------------------------------------------------------------------
    // Search Form Handler
    // -------------------------------------------------------------------------
    searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const city = cityInput.value.trim();

        if (!city) {
            showError("Couldn't find that city.", "Please check the city name and try again.");
            return;
        }

        fetchWeatherData(city);
    });

    /**
     * Fetch current weather and 5-day forecast from Flask API endpoints
     * @param {string} city
     */
    async function fetchWeatherData(city) {
        showLoading();

        try {
            // Asynchronously fetch current weather and forecast in parallel
            const [weatherRes, forecastRes] = await Promise.all([
                fetch(`/api/weather?city=${encodeURIComponent(city)}`),
                fetch(`/api/forecast?city=${encodeURIComponent(city)}`)
            ]);

            const weatherData = await weatherRes.json();

            // Validate current weather response
            if (!weatherRes.ok) {
                showError("Couldn't find that city.", "Please check the city name and try again.");
                return;
            }

            // Extract forecast data if available
            let forecastList = [];
            if (forecastRes.ok) {
                const forecastData = await forecastRes.json();
                forecastList = forecastData.forecast || [];
            }

            // Save last fetched weather and forecast data (preserves original Celsius values)
            lastFetchedWeatherData = weatherData;
            lastFetchedForecastData = forecastList;
            updateTheme();
            applyWeatherAtmosphere(weatherData.weather_main, weatherData.weather_description);

            // Populate DOM with retrieved data
            renderCurrentWeather(weatherData);
            renderForecast(forecastList);
            showDashboard();

            // Record successful search in Recent Searches & synchronize Favorites state
            addRecentSearch(weatherData.city, weatherData.country);
            updateFavoriteButtonState();
            renderFavorites();
            renderRecentSearches();

            // Fetch and render Air Quality asynchronously using coordinates
            if (weatherData.coordinates && typeof weatherData.coordinates.lat === 'number' && typeof weatherData.coordinates.lon === 'number') {
                fetchAirQuality(weatherData.coordinates.lat, weatherData.coordinates.lon);
            } else {
                renderAirQualityError('Coordinates unavailable for air quality.');
            }

            // Fetch and render Weather Alerts asynchronously using coordinates
            if (weatherData.coordinates && typeof weatherData.coordinates.lat === 'number' && typeof weatherData.coordinates.lon === 'number') {
                fetchWeatherAlerts(weatherData.coordinates.lat, weatherData.coordinates.lon, weatherData.timezone);
            } else {
                renderAlertsUnavailable('Coordinates unavailable for weather alerts.');
            }

        } catch (error) {
            console.error('Fetch error:', error);
            showError("Couldn't find that city.", "Please check the city name and try again.");
        }
    }

    /**
     * Render current weather details into the dashboard
     * @param {Object} data
     */
    function renderCurrentWeather(data) {
        currentCity.textContent = data.city;
        currentCountry.textContent = data.country || '';

        // Temperature (visual focus) & feels like (formatted with active unit)
        currentTemp.textContent = formatTemperature(data.temperature);
        feelsLike.textContent = `Feels like ${formatTemperature(data.feels_like)}`;

        // Weather condition & description
        weatherCondition.textContent = data.weather_main || 'Weather';
        weatherDescription.textContent = data.weather_description || '';

        // Weather condition symbol rendering (Vector SVG)
        const iconCode = data.weather_icon || '01d';
        if (weatherIconWrapper) {
            weatherIconWrapper.innerHTML = getWeatherIconSvg(iconCode, data.weather_main);
            weatherIconWrapper.setAttribute('aria-label', `${data.weather_description || data.weather_main} weather symbol`);
        }

        // Last updated time badge
        lastUpdatedBadge.textContent = `Last updated: ${formatCurrentTime()}`;

        // Four detail cards
        metricHumidity.textContent = data.humidity !== undefined ? data.humidity : '--';
        metricWind.textContent = data.wind_speed !== undefined ? data.wind_speed : '--';
        metricPressure.textContent = data.pressure !== undefined ? data.pressure : '--';

        // Visibility conversion: convert meters to kilometers
        if (typeof data.visibility === 'number') {
            const km = (data.visibility / 1000).toFixed(1);
            metricVisibility.textContent = km.endsWith('.0') ? parseInt(km, 10) : km;
        } else {
            metricVisibility.textContent = '--';
        }

        // Sun information: convert timestamps with timezone offset
        metricSunrise.textContent = formatSunTime(data.sunrise, data.timezone);
        metricSunset.textContent = formatSunTime(data.sunset, data.timezone);

        // Start live local clock for the searched city
        startLiveCityClock(data.timezone);
    }

    /**
     * Render 5-Day Forecast cards
     * @param {Array} forecast
     */
    function renderForecast(forecast) {
        lastFetchedForecastData = forecast;
        forecastCardsContainer.innerHTML = '';

        if (!forecast || forecast.length === 0) {
            forecastCardsContainer.innerHTML = `
                <p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem 0;">
                    Forecast data currently unavailable.
                </p>
            `;
            return;
        }

        forecast.forEach((item) => {
            const card = document.createElement('article');
            card.className = 'forecast-card';

            const { dayName, shortDate } = formatForecastDate(item.date, item.timestamp);
            const iconCode = item.weather_icon || '01d';

            card.innerHTML = `
                <span class="forecast-day">${dayName}</span>
                <span class="forecast-date">${shortDate}</span>
                <div class="forecast-card-icon-wrap" role="img" aria-label="${item.weather_description || 'Forecast condition'} symbol">
                    ${getWeatherIconSvg(iconCode, item.weather_main)}
                </div>
                <span class="forecast-temp">${formatTemperature(item.temperature)}</span>
                <span class="forecast-desc">${item.weather_description || item.weather_main || ''}</span>
            `;

            forecastCardsContainer.appendChild(card);
        });
    }

    /**
     * Generate an elegant, theme-consistent SVG weather symbol
     * @param {string} iconCode - e.g. "01d", "01n", "04d", "10n", etc.
     * @param {string} weatherMain - e.g. "Clear", "Clouds", "Rain", etc.
     * @returns {string} - SVG string
     */
    function getWeatherIconSvg(iconCode = '01d', weatherMain = '') {
        const isNight = iconCode.endsWith('n');
        const codePrefix = iconCode.substring(0, 2);
        const condition = (weatherMain || '').toLowerCase();

        // 1. Clear Sky (Day -> Warm radiant sun, Night -> Elegant crescent moon)
        if (codePrefix === '01' || condition === 'clear') {
            if (isNight) {
                return `
                <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <path d="M38 14 C27.5 15.5 19 24.5 19 35.5 C19 47 28.5 56 40 56 C44.5 56 48.5 54.5 52 52 C39.5 51 31.5 41 31.5 30 C31.5 22.5 35 16.5 40 13.5 C39.3 13.6 38.6 13.8 38 14 Z" fill="var(--color-btn-bg, #E98A4A)"/>
                    <path d="M46 22 L47.5 25.5 L51 27 L47.5 28.5 L46 32 L44.5 28.5 L41 27 L44.5 25.5 Z" fill="var(--text-primary, #FFF4DC)" opacity="0.85"/>
                    <circle cx="24" cy="22" r="1.2" fill="var(--text-primary, #FFF4DC)" opacity="0.6"/>
                </svg>`;
            } else {
                return `
                <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <line x1="32" y1="8" x2="32" y2="14" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="32" y1="50" x2="32" y2="56" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="8" y1="32" x2="14" y2="32" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="50" y1="32" x2="56" y2="32" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="15" y1="15" x2="19.5" y2="19.5" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="44.5" y1="44.5" x2="49" y2="49" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="15" y1="49" x2="19.5" y2="44.5" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <line x1="44.5" y1="19.5" x2="49" y2="15" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                    <circle cx="32" cy="32" r="12" fill="var(--color-warm, #E98A4A)"/>
                    <circle cx="32" cy="32" r="7.5" fill="#FFF9ED" opacity="0.45"/>
                </svg>`;
            }
        }

        // 2. Few Clouds (Sun/Moon with cloud)
        if (codePrefix === '02') {
            if (isNight) {
                return `
                <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <path d="M29 14 C21 15 15 22 15 30 C15 34 16.5 37.5 19 40 C21 34 26 29 32 28 C34 22 38 18 43 16 C39 14 33 13.5 29 14 Z" fill="var(--color-warm, #E98A4A)"/>
                    <path d="M20 44 h24 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 15 34.5 11 28 11 c-7.2 0-13.2 5.2-14.4 12.2 C13 23 12 23 11 23 c-5 0-9 4-9 9 s4 9 9 9 h9 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                </svg>`;
            } else {
                return `
                <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <circle cx="24" cy="22" r="10" fill="var(--color-warm, #E98A4A)"/>
                    <line x1="24" y1="7" x2="24" y2="10" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2" stroke-linecap="round"/>
                    <line x1="12" y1="12" x2="14.5" y2="14.5" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2" stroke-linecap="round"/>
                    <line x1="9" y1="22" x2="12" y2="22" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2" stroke-linecap="round"/>
                    <line x1="36" y1="14" x2="38.5" y2="12" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2" stroke-linecap="round"/>
                    <path d="M20 46 h24 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 17 34.5 13 28 13 c-7.2 0-13.2 5.2-14.4 12.2 C13 25 12 25 11 25 c-5 0-9 4-9 9 s4 9 9 9 h9 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                </svg>`;
            }
        }

        // 3. Rain & Showers
        if (codePrefix === '09' || codePrefix === '10' || condition === 'rain') {
            return `
            <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M19 38 h26 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 9 34.5 5 28 5 c-7.2 0-13.2 5.2-14.4 12.2 C13 17 12 17 11 17 c-5 0-9 4-9 9 s4 9 9 9 h8 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                <line x1="23" y1="44" x2="20" y2="54" stroke="var(--color-warm, #E98A4A)" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="33" y1="44" x2="30" y2="54" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="43" y1="44" x2="40" y2="54" stroke="var(--color-warm, #E98A4A)" stroke-width="2.6" stroke-linecap="round"/>
            </svg>`;
        }

        // 4. Drizzle
        if (condition === 'drizzle') {
            return `
            <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M19 38 h26 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 9 34.5 5 28 5 c-7.2 0-13.2 5.2-14.4 12.2 C13 17 12 17 11 17 c-5 0-9 4-9 9 s4 9 9 9 h8 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                <line x1="23" y1="44" x2="21" y2="49" stroke="var(--color-warm, #E98A4A)" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 3"/>
                <line x1="33" y1="44" x2="31" y2="49" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 3"/>
                <line x1="43" y1="44" x2="41" y2="49" stroke="var(--color-warm, #E98A4A)" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 3"/>
            </svg>`;
        }

        // 5. Thunderstorm
        if (codePrefix === '11' || condition === 'thunderstorm') {
            return `
            <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M19 36 h26 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 7 34.5 3 28 3 c-7.2 0-13.2 5.2-14.4 12.2 C13 15 12 15 11 15 c-5 0-9 4-9 9 s4 9 9 9 h8 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                <polygon points="33,36 24,48 32,48 27,60 43,45 35,45" fill="var(--color-warm, #E98A4A)" stroke="var(--color-btn-bg, #C65D21)" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>`;
        }

        // 6. Snow
        if (codePrefix === '13' || condition === 'snow') {
            return `
            <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M19 38 h26 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 9 34.5 5 28 5 c-7.2 0-13.2 5.2-14.4 12.2 C13 17 12 17 11 17 c-5 0-9 4-9 9 s4 9 9 9 h8 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
                <g stroke="var(--color-warm, #E98A4A)" stroke-width="1.8" stroke-linecap="round">
                    <line x1="22" y1="46" x2="22" y2="52"/><line x1="19" y1="49" x2="25" y2="49"/>
                    <line x1="32" y1="46" x2="32" y2="52"/><line x1="29" y1="49" x2="35" y2="49"/>
                    <line x1="42" y1="46" x2="42" y2="52"/><line x1="39" y1="49" x2="45" y2="49"/>
                </g>
            </svg>`;
        }

        // 7. Mist / Fog / Haze
        if (codePrefix === '50' || condition === 'mist' || condition === 'fog' || condition === 'haze') {
            return `
            <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <line x1="14" y1="22" x2="50" y2="22" stroke="var(--color-warm, #E98A4A)" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="18" y1="30" x2="46" y2="30" stroke="var(--text-muted, #8C6A53)" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="12" y1="38" x2="52" y2="38" stroke="var(--color-btn-bg, #C65D21)" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="19" y1="46" x2="45" y2="46" stroke="var(--text-muted, #8C6A53)" stroke-width="2.6" stroke-linecap="round"/>
            </svg>`;
        }

        // 8. General / Overcast Clouds (Default fallback)
        return `
        <svg class="weather-svg-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path d="M26 15 c5 0 9.2 3.2 10.6 7.6 C37.8 22.2 39 22 40.2 22 c5.4 0 9.8 4.4 9.8 9.8 c0 0.4 0 0.8 -0.1 1.2 C54.4 34 58 38 58 43 c0 5.5 -4.5 10 -10 10 H22 C15.4 53 10 47.6 10 41 c0 -5.8 4.2 -10.6 9.8 -11.7 C20.3 22.5 25.4 15 26 15 Z" fill="var(--badge-border, #F8E8C8)" opacity="0.6"/>
            <path d="M19 46 h26 c6.6 0 12-5.4 12-12 s-5.4-12-12-12 c-0.8 0-1.6 0.1-2.4 0.3 C40 17 34.5 13 28 13 c-7.2 0-13.2 5.2-14.4 12.2 C13 25 12 25 11 25 c-5 0-9 4-9 9 s4 9 9 9 h9 z" fill="var(--border-card, #F8E8C8)" opacity="0.95"/>
        </svg>`;
    }

    /**
     * Format current local clock time (e.g., "7:52 PM")
     * @returns {string}
     */
    function formatCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    /**
     * Format timezone offset in seconds to standard UTC string (e.g., "UTC+5:30", "UTC-4", "UTC+9", "UTC+0")
     * @param {number} offsetSeconds
     * @returns {string}
     */
    function formatUtcOffset(offsetSeconds) {
        if (typeof offsetSeconds !== 'number' || isNaN(offsetSeconds)) {
            return 'UTC';
        }
        const sign = offsetSeconds >= 0 ? '+' : '-';
        const absSeconds = Math.abs(offsetSeconds);
        const hours = Math.floor(absSeconds / 3600);
        const minutes = Math.floor((absSeconds % 3600) / 60);

        if (minutes === 0) {
            return `UTC${sign}${hours}`;
        } else {
            const formattedMinutes = minutes.toString().padStart(2, '0');
            return `UTC${sign}${hours}:${formattedMinutes}`;
        }
    }

    /**
     * Stop active live city clock interval to prevent duplicate intervals
     */
    function stopLiveCityClock() {
        if (clockIntervalId) {
            clearInterval(clockIntervalId);
            clockIntervalId = null;
        }
    }

    /**
     * Calculate and display the searched city's local time, date, and UTC offset
     * @param {number} timezoneOffsetSeconds
     */
    function updateCityClockDisplay(timezoneOffsetSeconds) {
        if (!localTimeClock || !localDateString || !localTimezoneBadge) return;

        // Calculate searched city's current local time independent of client computer timezone
        const nowUtcMs = Date.now();
        const cityTimeMs = nowUtcMs + (timezoneOffsetSeconds * 1000);
        const cityDate = new Date(cityTimeMs);

        // 12-hour format with AM/PM
        let hours = cityDate.getUTCHours();
        const minutes = cityDate.getUTCMinutes().toString().padStart(2, '0');
        const seconds = cityDate.getUTCSeconds().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12; // 0 converts to 12

        localTimeClock.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;

        // Local weekday and calendar date
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const weekday = weekdays[cityDate.getUTCDay()];
        const month = months[cityDate.getUTCMonth()];
        const day = cityDate.getUTCDate();

        localDateString.textContent = `${weekday}, ${month} ${day}`;

        // Timezone badge
        localTimezoneBadge.textContent = formatUtcOffset(timezoneOffsetSeconds);
    }

    /**
     * Start live clock updating every second for the searched city's timezone offset
     * @param {number} timezoneOffsetSeconds
     */
    function startLiveCityClock(timezoneOffsetSeconds) {
        // Stop previous interval so multiple intervals never run simultaneously
        stopLiveCityClock();

        // Safe error handling if timezone is missing or invalid
        if (typeof timezoneOffsetSeconds !== 'number' || isNaN(timezoneOffsetSeconds)) {
            if (localTimeCard) localTimeCard.classList.add('hidden');
            return;
        }

        if (localTimeCard) {
            localTimeCard.classList.remove('hidden');
        }

        // Render immediately on city selection
        updateCityClockDisplay(timezoneOffsetSeconds);

        // Update displayed clock every second without making any new API requests
        clockIntervalId = setInterval(() => {
            updateCityClockDisplay(timezoneOffsetSeconds);
        }, 1000);
    }

    /**
     * Convert Unix timestamp and timezone offset into readable time (e.g., "6:14 AM")
     * @param {number} timestamp - seconds
     * @param {number} timezoneOffset - seconds
     * @returns {string}
     */
    function formatSunTime(timestamp, timezoneOffset = 0) {
        if (!timestamp) return '--:--';

        // Calculate UTC milliseconds + timezone offset in milliseconds
        const date = new Date((timestamp + timezoneOffset) * 1000);
        let hours = date.getUTCHours();
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12; // 0 hour converts to 12

        return `${hours}:${minutes} ${ampm}`;
    }

    /**
     * Parse date string or timestamp into Day Name and Short Date
     * @param {string} dateStr - "YYYY-MM-DD"
     * @param {number} timestamp - seconds
     * @returns {{ dayName: string, shortDate: string }}
     */
    function formatForecastDate(dateStr, timestamp) {
        let dateObj;
        if (timestamp) {
            dateObj = new Date(timestamp * 1000);
        } else if (dateStr) {
            const [year, month, day] = dateStr.split('-');
            dateObj = new Date(year, month - 1, day);
        } else {
            dateObj = new Date();
        }

        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return { dayName, shortDate };
    }

    // State Display Helpers
    function showLoading() {
        initialState.classList.add('hidden');
        errorState.classList.add('hidden');
        weatherDashboard.classList.add('hidden');
        loadingState.classList.remove('hidden');
        searchBtn.disabled = true;
        applyWeatherAtmosphere('neutral', '');
    }

    function showError(title, detail) {
        initialState.classList.add('hidden');
        loadingState.classList.add('hidden');
        weatherDashboard.classList.add('hidden');

        errorTitle.textContent = title;
        errorDetail.textContent = detail;
        errorState.classList.remove('hidden');
        searchBtn.disabled = false;
        stopLiveCityClock();
        applyWeatherAtmosphere('neutral', '');
    }

    function showDashboard() {
        initialState.classList.add('hidden');
        loadingState.classList.add('hidden');
        errorState.classList.add('hidden');
        weatherDashboard.classList.remove('hidden');
        searchBtn.disabled = false;
    }

    // -------------------------------------------------------------------------
    // Storage Safety & Helpers
    // -------------------------------------------------------------------------

    /**
     * Safe localStorage parser with malformed data recovery
     * @param {string} key
     * @returns {Array}
     */
    function getStorageArray(key) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return [];
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            // If data is not an array, safely reset this item only
            localStorage.removeItem(key);
            return [];
        } catch (e) {
            console.warn(`Malformed storage data in ${key}, resetting safely.`, e);
            try {
                localStorage.removeItem(key);
            } catch (_) {}
            return [];
        }
    }

    /**
     * Safe localStorage writer
     * @param {string} key
     * @param {Array} data
     */
    function setStorageArray(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn(`Unable to save ${key} to localStorage:`, e);
        }
    }

    /**
     * Escape special HTML characters to prevent XSS
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // -------------------------------------------------------------------------
    // Favorite Cities Management
    // -------------------------------------------------------------------------

    /**
     * Load favorites list from localStorage
     * @returns {Array<{city: string, country: string}>}
     */
    function loadFavorites() {
        return getStorageArray(STORAGE_KEYS.favorites);
    }

    /**
     * Save favorites list to localStorage
     * @param {Array<{city: string, country: string}>} favorites
     */
    function saveFavorites(favorites) {
        setStorageArray(STORAGE_KEYS.favorites, favorites);
    }

    /**
     * Check if a city is in favorites (case-insensitive)
     * @param {string} cityName
     * @returns {boolean}
     */
    function isFavorite(cityName) {
        if (!cityName) return false;
        const normalized = cityName.trim().toLowerCase();
        const favorites = loadFavorites();
        return favorites.some(item => (item.city || '').trim().toLowerCase() === normalized);
    }

    /**
     * Add a city to favorites (prevents duplicates)
     * @param {string} cityName
     * @param {string} countryCode
     */
    function addFavorite(cityName, countryCode = '') {
        if (!cityName) return;
        const normalized = cityName.trim().toLowerCase();
        const favorites = loadFavorites();
        const exists = favorites.some(item => (item.city || '').trim().toLowerCase() === normalized);
        if (!exists) {
            favorites.push({
                city: cityName.trim(),
                country: (countryCode || '').trim().toUpperCase()
            });
            saveFavorites(favorites);
            renderFavorites();
            updateFavoriteButtonState();
        }
    }

    /**
     * Remove a city from favorites
     * @param {string} cityName
     */
    function removeFavorite(cityName) {
        if (!cityName) return;
        const normalized = cityName.trim().toLowerCase();
        let favorites = loadFavorites();
        favorites = favorites.filter(item => (item.city || '').trim().toLowerCase() !== normalized);
        saveFavorites(favorites);
        renderFavorites();
        updateFavoriteButtonState();
    }

    /**
     * Render saved favorite cities chips
     */
    function renderFavorites() {
        if (!favoritesList) return;
        const favorites = loadFavorites();
        const currentActiveCity = lastFetchedWeatherData ? (lastFetchedWeatherData.city || '').trim().toLowerCase() : '';

        if (favoritesCountBadge) {
            favoritesCountBadge.textContent = favorites.length;
            favoritesCountBadge.classList.toggle('hidden', favorites.length === 0);
        }

        favoritesList.innerHTML = '';

        if (favorites.length === 0) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'empty-chips-text';
            emptySpan.textContent = 'No favorite cities yet';
            favoritesList.appendChild(emptySpan);
            return;
        }

        favorites.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'city-chip';
            const isCurrent = (item.city || '').trim().toLowerCase() === currentActiveCity;
            if (isCurrent) chip.classList.add('is-active');

            const chipBtn = document.createElement('button');
            chipBtn.type = 'button';
            chipBtn.className = 'city-chip-btn';
            chipBtn.setAttribute('aria-label', `Load weather for ${item.city}${item.country ? ', ' + item.country : ''}`);
            chipBtn.title = `Load weather for ${item.city}`;
            chipBtn.innerHTML = `
                <span class="city-chip-name">${escapeHtml(item.city)}</span>
                ${item.country ? `<span class="city-chip-country">${escapeHtml(item.country)}</span>` : ''}
            `;
            chipBtn.addEventListener('click', () => {
                if (cityInput) cityInput.value = item.city;
                fetchWeatherData(item.city);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'city-chip-remove';
            removeBtn.setAttribute('aria-label', `Remove ${item.city} from favorites`);
            removeBtn.title = `Remove ${item.city} from favorites`;
            removeBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFavorite(item.city);
            });

            chip.appendChild(chipBtn);
            chip.appendChild(removeBtn);
            favoritesList.appendChild(chip);
        });
    }

    // -------------------------------------------------------------------------
    // Recent Searches Management
    // -------------------------------------------------------------------------

    /**
     * Load recent searches list from localStorage
     * @returns {Array<{city: string, country: string}>}
     */
    function loadRecentSearches() {
        return getStorageArray(STORAGE_KEYS.recentSearches);
    }

    /**
     * Save recent searches list to localStorage
     * @param {Array<{city: string, country: string}>} recent
     */
    function saveRecentSearches(recent) {
        setStorageArray(STORAGE_KEYS.recentSearches, recent);
    }

    /**
     * Add a city to recent searches (maximum 5, most recent first, avoids duplicate)
     * @param {string} cityName
     * @param {string} countryCode
     */
    function addRecentSearch(cityName, countryCode = '') {
        if (!cityName) return;
        const normalized = cityName.trim().toLowerCase();
        let recent = loadRecentSearches();

        // Remove previous instance if it already exists to bring to top
        recent = recent.filter(item => (item.city || '').trim().toLowerCase() !== normalized);

        // Prepend latest search to the beginning
        recent.unshift({
            city: cityName.trim(),
            country: (countryCode || '').trim().toUpperCase()
        });

        // Limit to maximum 5 items
        if (recent.length > MAX_RECENT_SEARCHES) {
            recent = recent.slice(0, MAX_RECENT_SEARCHES);
        }

        saveRecentSearches(recent);
        renderRecentSearches();
    }

    /**
     * Clear all recent searches without affecting favorites
     */
    function clearRecentSearches() {
        saveRecentSearches([]);
        renderRecentSearches();
    }

    /**
     * Render recent search history chips
     */
    function renderRecentSearches() {
        if (!recentList) return;
        const recent = loadRecentSearches();
        const currentActiveCity = lastFetchedWeatherData ? (lastFetchedWeatherData.city || '').trim().toLowerCase() : '';

        if (recentCountBadge) {
            recentCountBadge.textContent = recent.length;
            recentCountBadge.classList.toggle('hidden', recent.length === 0);
        }

        if (clearRecentBtn) {
            clearRecentBtn.disabled = recent.length === 0;
        }

        recentList.innerHTML = '';

        if (recent.length === 0) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'empty-chips-text';
            emptySpan.textContent = 'No recent searches';
            recentList.appendChild(emptySpan);
            return;
        }

        recent.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'city-chip';
            const isCurrent = (item.city || '').trim().toLowerCase() === currentActiveCity;
            if (isCurrent) chip.classList.add('is-active');

            const chipBtn = document.createElement('button');
            chipBtn.type = 'button';
            chipBtn.className = 'city-chip-btn';
            chipBtn.setAttribute('aria-label', `Load weather for ${item.city}${item.country ? ', ' + item.country : ''}`);
            chipBtn.title = `Load weather for ${item.city}`;
            chipBtn.innerHTML = `
                <span class="city-chip-name">${escapeHtml(item.city)}</span>
                ${item.country ? `<span class="city-chip-country">${escapeHtml(item.country)}</span>` : ''}
            `;
            chipBtn.addEventListener('click', () => {
                if (cityInput) cityInput.value = item.city;
                fetchWeatherData(item.city);
            });

            chip.appendChild(chipBtn);
            recentList.appendChild(chip);
        });
    }

    // -------------------------------------------------------------------------
    // Favorite Button UI Synchronization
    // -------------------------------------------------------------------------

    /**
     * Synchronize favorite heart button state for the currently displayed city
     */
    function updateFavoriteButtonState() {
        if (!favoriteToggleBtn || !lastFetchedWeatherData) return;
        const cityName = lastFetchedWeatherData.city || '';
        const favorited = isFavorite(cityName);

        favoriteToggleBtn.classList.toggle('is-favorited', favorited);
        favoriteToggleBtn.setAttribute('aria-pressed', favorited ? 'true' : 'false');

        if (favorited) {
            favoriteToggleBtn.setAttribute('aria-label', `Remove ${cityName} from favorites`);
            favoriteToggleBtn.title = `Remove ${cityName} from favorites`;
            if (favoriteBtnText) favoriteBtnText.textContent = 'Favorited';
        } else {
            favoriteToggleBtn.setAttribute('aria-label', `Add ${cityName} to favorites`);
            favoriteToggleBtn.title = `Add ${cityName} to favorites`;
            if (favoriteBtnText) favoriteBtnText.textContent = 'Favorite';
        }
    }

    // Favorite Toggle Button Click Handler
    if (favoriteToggleBtn) {
        favoriteToggleBtn.addEventListener('click', () => {
            if (!lastFetchedWeatherData || !lastFetchedWeatherData.city) return;
            const cityName = lastFetchedWeatherData.city;
            const countryCode = lastFetchedWeatherData.country || '';

            if (isFavorite(cityName)) {
                removeFavorite(cityName);
            } else {
                addFavorite(cityName, countryCode);
            }
        });
    }

    // Clear Recent Searches Button Click Handler
    if (clearRecentBtn) {
        clearRecentBtn.addEventListener('click', () => {
            clearRecentSearches();
        });
    }

    // -------------------------------------------------------------------------
    // Temperature Unit Management & Conversions
    // -------------------------------------------------------------------------

    /**
     * Retrieve current temperature unit preference from localStorage ('celsius' or 'fahrenheit')
     * Defaults to 'celsius' if not set
     * @returns {'celsius' | 'fahrenheit'}
     */
    function getTemperatureUnit() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.temperatureUnit);
            if (saved === 'fahrenheit' || saved === 'celsius') {
                return saved;
            }
        } catch (e) {
            console.warn('Could not read temperature unit preference from localStorage:', e);
        }
        return 'celsius';
    }

    /**
     * Set temperature unit preference, persist to localStorage, and refresh UI displays
     * @param {'celsius' | 'fahrenheit'} unit
     */
    function setTemperatureUnit(unit) {
        if (unit !== 'celsius' && unit !== 'fahrenheit') return;
        currentTemperatureUnit = unit;
        try {
            localStorage.setItem(STORAGE_KEYS.temperatureUnit, unit);
        } catch (e) {
            console.warn('Could not save temperature unit preference to localStorage:', e);
        }
        updateUnitToggleUI();
        updateTemperatureDisplays();
    }

    /**
     * Convert Celsius temperature to rounded Fahrenheit integer
     * Formula: (Celsius * 9 / 5) + 32
     * @param {number} celsius
     * @returns {number}
     */
    function celsiusToFahrenheit(celsius) {
        return Math.round((celsius * 9) / 5 + 32);
    }

    /**
     * Format a temperature value according to the specified or active unit
     * Displays clean whole numbers: "29°C" or "84°F"
     * @param {number} celsius - Original API temperature in Celsius
     * @param {'celsius' | 'fahrenheit'} [unit]
     * @returns {string}
     */
    function formatTemperature(celsius, unit = currentTemperatureUnit) {
        if (celsius === null || celsius === undefined || isNaN(celsius)) {
            return '--';
        }
        if (unit === 'fahrenheit') {
            return `${celsiusToFahrenheit(celsius)}°F`;
        }
        return `${Math.round(celsius)}°C`;
    }

    /**
     * Synchronize the unit toggle segmented control UI state and accessibility attributes
     */
    function updateUnitToggleUI() {
        unitButtons.forEach(btn => {
            const isMatch = btn.dataset.unit === currentTemperatureUnit;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
        });
    }

    /**
     * Update all rendered temperature displays (current temp, feels-like, forecast)
     * using the active unit without issuing new API requests
     */
    function updateTemperatureDisplays() {
        if (lastFetchedWeatherData) {
            currentTemp.textContent = formatTemperature(lastFetchedWeatherData.temperature);
            feelsLike.textContent = `Feels like ${formatTemperature(lastFetchedWeatherData.feels_like)}`;
        } else {
            const unitSuffix = currentTemperatureUnit === 'fahrenheit' ? '°F' : '°C';
            currentTemp.textContent = `--${unitSuffix}`;
            feelsLike.textContent = `Feels like --${unitSuffix}`;
        }

        if (lastFetchedForecastData && lastFetchedForecastData.length > 0) {
            renderForecast(lastFetchedForecastData);
        }
    }

    // Temperature Unit Buttons Click Handler
    unitButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const unit = btn.dataset.unit;
            if (unit && unit !== currentTemperatureUnit) {
                setTemperatureUnit(unit);
            }
        });
    });

    // -------------------------------------------------------------------------
    // Air Quality Management & Rendering
    // -------------------------------------------------------------------------

    /**
     * Map numeric AQI (1-5) to human-readable category name
     * @param {number} aqi
     * @returns {string}
     */
    function getAqiCategory(aqi) {
        return AQI_CATEGORIES[aqi] || 'Moderate';
    }

    /**
     * Format pollutant concentration with sensible precision (up to 1 decimal place or whole number)
     * @param {number|null} value
     * @returns {string}
     */
    function formatPollutant(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }
        const num = Number(value);
        if (Number.isInteger(num)) {
            return num.toString();
        }
        const fixed = num.toFixed(1);
        return fixed.endsWith('.0') ? Math.round(num).toString() : fixed;
    }

    /**
     * Show subtle loading state inside the Air Quality card
     */
    function renderAirQualityLoading() {
        if (airQualityError) airQualityError.classList.add('hidden');
        if (airQualityLoading) airQualityLoading.classList.remove('hidden');
        if (aqiValue) aqiValue.textContent = '--';
        if (aqiCategory) aqiCategory.textContent = 'Loading...';
        if (aqiIndicator) {
            aqiIndicator.className = 'aqi-indicator aqi-level-1';
            aqiIndicator.setAttribute('aria-label', 'Air Quality loading');
        }
    }

    /**
     * Show friendly error state inside the Air Quality card without failing the dashboard
     * @param {string} [message]
     */
    function renderAirQualityError(message = 'Air quality data is currently unavailable.') {
        if (airQualityLoading) airQualityLoading.classList.add('hidden');
        if (pollutantsGrid) pollutantsGrid.classList.add('hidden');
        if (airQualityError) {
            if (airQualityErrorText) airQualityErrorText.textContent = message;
            airQualityError.classList.remove('hidden');
        }
        if (aqiValue) aqiValue.textContent = '--';
        if (aqiCategory) aqiCategory.textContent = 'Unavailable';
        if (aqiIndicator) {
            aqiIndicator.className = 'aqi-indicator aqi-level-1';
            aqiIndicator.setAttribute('aria-label', 'Air quality unavailable');
        }
    }

    /**
     * Populate Air Quality Index and pollutant concentrations in the DOM
     * @param {Object} data
     */
    function renderAirQuality(data) {
        if (!data) return;
        if (airQualityLoading) airQualityLoading.classList.add('hidden');
        if (airQualityError) airQualityError.classList.add('hidden');
        if (pollutantsGrid) pollutantsGrid.classList.remove('hidden');

        const aqi = data.aqi || 1;
        const category = data.category || getAqiCategory(aqi);

        if (aqiValue) aqiValue.textContent = aqi;
        if (aqiCategory) aqiCategory.textContent = category;

        if (aqiIndicator) {
            aqiIndicator.className = `aqi-indicator aqi-level-${aqi}`;
            aqiIndicator.setAttribute('aria-label', `Air Quality Index ${aqi}, ${category}`);
        }

        const pollutants = data.pollutants || {};
        if (pollutantPm25) pollutantPm25.textContent = formatPollutant(pollutants.pm2_5);
        if (pollutantPm10) pollutantPm10.textContent = formatPollutant(pollutants.pm10);
        if (pollutantNo2) pollutantNo2.textContent = formatPollutant(pollutants.no2);
        if (pollutantO3) pollutantO3.textContent = formatPollutant(pollutants.o3);
        if (pollutantCo) pollutantCo.textContent = formatPollutant(pollutants.co);
        if (pollutantSo2) pollutantSo2.textContent = formatPollutant(pollutants.so2);
    }

    /**
     * Fetch air quality data for given coordinates with session caching and stale response protection
     * @param {number} lat
     * @param {number} lon
     */
    async function fetchAirQuality(lat, lon) {
        if (lat === null || lat === undefined || lon === null || lon === undefined) {
            renderAirQualityError('Coordinates unavailable.');
            return;
        }

        const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
        if (airQualitySessionCache.has(cacheKey)) {
            renderAirQuality(airQualitySessionCache.get(cacheKey));
            return;
        }

        renderAirQualityLoading();

        currentAirQualityRequestId++;
        const requestId = currentAirQualityRequestId;

        try {
            const response = await fetch(`/api/air-quality?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);

            // Stale response protection: if a newer search was initiated, drop this response
            if (requestId !== currentAirQualityRequestId) {
                return;
            }

            if (!response.ok) {
                renderAirQualityError('Air quality data is currently unavailable.');
                return;
            }

            const data = await response.json();

            if (requestId !== currentAirQualityRequestId) {
                return;
            }

            airQualitySessionCache.set(cacheKey, data);
            renderAirQuality(data);

        } catch (err) {
            console.warn('Air quality fetch error:', err);
            if (requestId === currentAirQualityRequestId) {
                renderAirQualityError('Air quality data is currently unavailable.');
            }
        }
    }

    // -------------------------------------------------------------------------
    // Weather Alerts Management & Rendering
    // -------------------------------------------------------------------------

    /**
     * Format Unix timestamp using searched city's timezone offset (independent of client timezone)
     * e.g., "08 Oct, 7:00 PM"
     * @param {number|null} timestamp - Unix timestamp in seconds
     * @param {number} timezoneOffsetSeconds - City timezone offset in seconds
     * @returns {string|null}
     */
    function formatAlertTime(timestamp, timezoneOffsetSeconds = 0) {
        if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
            return null;
        }

        const date = new Date((timestamp + timezoneOffsetSeconds) * 1000);
        const day = date.getUTCDate().toString().padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getUTCMonth()];

        let hours = date.getUTCHours();
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;

        return `${day} ${month}, ${hours}:${minutes} ${ampm}`;
    }

    /**
     * Set the SVG icon for the alerts status box
     * @param {'check' | 'warning' | 'info'} type
     */
    function setAlertsIcon(type) {
        if (!alertsStatusIcon) return;
        if (type === 'check') {
            alertsStatusIcon.innerHTML = `
                <svg class="alerts-svg-icon icon-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        } else if (type === 'warning') {
            alertsStatusIcon.innerHTML = `
                <svg class="alerts-svg-icon icon-warning" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            `;
        } else {
            alertsStatusIcon.innerHTML = `
                <svg class="alerts-svg-icon icon-info" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            `;
        }
    }

    /**
     * Show subtle loading state inside the Weather Alerts card
     */
    function renderAlertsLoading() {
        if (!alertsContainer) return;
        alertsContainer.className = 'alerts-container alerts-loading';
        if (alertsCountBadge) alertsCountBadge.classList.add('hidden');
        if (alertsList) alertsList.classList.add('hidden');
        if (alertsLoading) alertsLoading.classList.remove('hidden');
        if (alertsHeading) alertsHeading.textContent = 'Weather Alerts';
        if (alertsSubtitle) alertsSubtitle.textContent = 'Checking for active alerts...';
        setAlertsIcon('info');
    }

    /**
     * Render calm state when no alerts are active
     * @param {string} [message]
     */
    function renderNoAlerts(message = 'No active weather alerts') {
        if (!alertsContainer) return;
        alertsContainer.className = 'alerts-container alerts-calm';
        if (alertsLoading) alertsLoading.classList.add('hidden');
        if (alertsCountBadge) alertsCountBadge.classList.add('hidden');
        if (alertsList) {
            alertsList.classList.add('hidden');
            alertsList.innerHTML = '';
        }
        if (alertsHeading) alertsHeading.textContent = 'Weather Alerts';
        if (alertsSubtitle) alertsSubtitle.textContent = message;
        setAlertsIcon('check');
    }

    /**
     * Render calm informative unavailable state (when alerts endpoint is not supported by API tier)
     * @param {string} [message]
     */
    function renderAlertsUnavailable(message = 'Weather alerts are not available for this location.') {
        if (!alertsContainer) return;
        alertsContainer.className = 'alerts-container alerts-unavailable';
        if (alertsLoading) alertsLoading.classList.add('hidden');
        if (alertsCountBadge) alertsCountBadge.classList.add('hidden');
        if (alertsList) {
            alertsList.classList.add('hidden');
            alertsList.innerHTML = '';
        }
        if (alertsHeading) alertsHeading.textContent = 'Weather Alerts';
        if (alertsSubtitle) alertsSubtitle.textContent = message;
        setAlertsIcon('info');
    }

    /**
     * Render active weather alerts into individual cards
     * @param {Array<Object>} alerts
     * @param {number} timezoneOffsetSeconds
     */
    function renderWeatherAlerts(alerts, timezoneOffsetSeconds = 0) {
        if (!alertsContainer) return;

        if (!alerts || alerts.length === 0) {
            renderNoAlerts();
            return;
        }

        alertsContainer.className = 'alerts-container alerts-warning';
        if (alertsLoading) alertsLoading.classList.add('hidden');

        if (alertsHeading) alertsHeading.textContent = 'Weather Alerts';
        if (alertsSubtitle) alertsSubtitle.textContent = 'Active weather warnings in effect';
        setAlertsIcon('warning');

        if (alertsCountBadge) {
            alertsCountBadge.textContent = `${alerts.length} ${alerts.length === 1 ? 'Alert' : 'Alerts'}`;
            alertsCountBadge.classList.remove('hidden');
        }

        if (alertsList) {
            alertsList.innerHTML = '';
            alertsList.classList.remove('hidden');

            alerts.forEach((alert) => {
                const card = document.createElement('article');
                card.className = 'alert-item-card';

                // Format times using city's timezone
                const startTimeStr = formatAlertTime(alert.start, timezoneOffsetSeconds);
                const endTimeStr = formatAlertTime(alert.end, timezoneOffsetSeconds);

                let timingHtml = '';
                if (startTimeStr && endTimeStr) {
                    timingHtml = `
                        <div class="alert-item-timing">
                            <span class="alert-time-point">
                                <span>Starts:</span>
                                <strong class="alert-time-strong">${escapeHtml(startTimeStr)}</strong>
                            </span>
                            <span class="alert-time-sep" aria-hidden="true">&bull;</span>
                            <span class="alert-time-point">
                                <span>Ends:</span>
                                <strong class="alert-time-strong">${escapeHtml(endTimeStr)}</strong>
                            </span>
                        </div>
                    `;
                } else if (startTimeStr) {
                    timingHtml = `
                        <div class="alert-item-timing">
                            <span class="alert-time-point">
                                <span>Starts:</span>
                                <strong class="alert-time-strong">${escapeHtml(startTimeStr)}</strong>
                            </span>
                        </div>
                    `;
                } else if (endTimeStr) {
                    timingHtml = `
                        <div class="alert-item-timing">
                            <span class="alert-time-point">
                                <span>Ends:</span>
                                <strong class="alert-time-strong">${escapeHtml(endTimeStr)}</strong>
                            </span>
                        </div>
                    `;
                }

                // Tags badges if provided
                let tagsHtml = '';
                if (Array.isArray(alert.tags) && alert.tags.length > 0) {
                    tagsHtml = alert.tags.map(tag => `<span class="alert-tag-badge">${escapeHtml(tag)}</span>`).join('');
                }

                // Sender badge if provided
                const senderHtml = alert.sender_name
                    ? `<span class="alert-sender-badge">${escapeHtml(alert.sender_name)}</span>`
                    : '';

                card.innerHTML = `
                    <div class="alert-item-header">
                        <div class="alert-item-title-wrap">
                            <h4 class="alert-item-title">${escapeHtml(alert.event || 'Weather Warning')}</h4>
                            ${senderHtml}
                        </div>
                        ${tagsHtml ? `<div class="alert-item-tags">${tagsHtml}</div>` : ''}
                    </div>
                    ${alert.description ? `<p class="alert-item-desc">${escapeHtml(alert.description)}</p>` : ''}
                    ${timingHtml}
                `;

                alertsList.appendChild(card);
            });
        }
    }

    /**
     * Fetch weather alerts for given coordinates with session caching and stale response protection
     * @param {number} lat
     * @param {number} lon
     * @param {number} timezoneOffset
     */
    async function fetchWeatherAlerts(lat, lon, timezoneOffset = 0) {
        if (lat === null || lat === undefined || lon === null || lon === undefined) {
            renderAlertsUnavailable('Coordinates unavailable.');
            return;
        }

        const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
        if (alertsSessionCache.has(cacheKey)) {
            const cached = alertsSessionCache.get(cacheKey);
            if (cached.status === 'active' && cached.alerts && cached.alerts.length > 0) {
                renderWeatherAlerts(cached.alerts, cached.timezone_offset !== undefined ? cached.timezone_offset : timezoneOffset);
            } else if (cached.status === 'none') {
                renderNoAlerts(cached.message || 'No active weather alerts');
            } else {
                renderAlertsUnavailable(cached.message || 'Weather alerts are not available for this location.');
            }
            return;
        }

        renderAlertsLoading();

        currentAlertsRequestId++;
        const requestId = currentAlertsRequestId;

        try {
            const response = await fetch(`/api/alerts?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);

            // Stale response protection: if a newer search was initiated, drop this response
            if (requestId !== currentAlertsRequestId) {
                return;
            }

            if (!response.ok) {
                renderAlertsUnavailable('Weather alerts are currently unavailable.');
                return;
            }

            const data = await response.json();

            if (requestId !== currentAlertsRequestId) {
                return;
            }

            alertsSessionCache.set(cacheKey, data);

            if (data.status === 'active' && Array.isArray(data.alerts) && data.alerts.length > 0) {
                renderWeatherAlerts(data.alerts, data.timezone_offset !== undefined ? data.timezone_offset : timezoneOffset);
            } else if (data.status === 'none') {
                renderNoAlerts(data.message || 'No active weather alerts');
            } else {
                renderAlertsUnavailable(data.message || 'Weather alerts are not available for this location.');
            }

        } catch (err) {
            console.warn('Weather alerts fetch error:', err);
            if (requestId === currentAlertsRequestId) {
                renderAlertsUnavailable('Weather alerts are currently unavailable.');
            }
        }
    }

    // -------------------------------------------------------------------------
    // Initial Load & Bootstrapping
    // -------------------------------------------------------------------------
    currentTemperatureUnit = getTemperatureUnit();
    updateUnitToggleUI();
    updateTemperatureDisplays();
    renderFavorites();
    renderRecentSearches();
    applyWeatherAtmosphere('neutral', '');
});
