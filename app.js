// ===== STATE MANAGEMENT =====
const state = {
  allPokemon: [],           // Full Pokemon dataset
  displayedPokemon: [],     // Filtered Pokemon
  disabledPokemon: new Set(), // Set of disabled Pokemon IDs
  chosenPokemonId: null,    // The user's chosen Pokemon (their identity)
  currentLanguage: 'en',    // Current selected language (en, de, es, ja)
  generationMap: {},        // Map: pokemon-species-name -> generation-number
  currentFilters: {
    generations: new Set(), // Set of selected generations (empty = all)
    notGenerations: new Set(), // Set of excluded generations (NOT state)
    types: new Set(),       // Set of selected types (empty = all types)
    notTypes: new Set(),    // Set of excluded types (NOT state)
    typeCount: new Set(),   // 'single' or 'dual' (empty = both)
    notTypeCount: new Set(), // Excluded type counts (NOT state)
    evolutionStages: new Set(), // Selected evolution stages (empty = all)
    notEvolutionStages: new Set(), // Excluded evolution stages (NOT state)
    specialCategories: new Set(),      // 'baby', 'legendary', 'mythical'
    notSpecialCategories: new Set(),   // Excluded special categories
    colors: new Set(),           // Selected colors (OR logic)
    notColors: new Set(),        // Excluded colors (NOT state)
    name: ''                // Name search string
  },
};

// ===== CONSTANTS =====
const API_BASE = 'https://pokeapi.co/api/v2';
const BATCH_SIZE = 30; // Fetch Pokemon in batches of 30
const MAX_POKEMON_ID = 1025; // Stop at Pecharunt, exclude alternate forms

// Roman numeral conversion
const ROMAN_NUMERALS = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
  6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX'
};

// Pokemon type colors (official Pokemon type colors)
const TYPE_COLORS = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC'
};

// Pokemon color values (for color filter buttons)
const COLOR_COLORS = {
  black: '#2C2C2C',
  blue: '#3498DB',
  brown: '#8B4513',
  gray: '#7F8C8D',
  green: '#27AE60',
  pink: '#FF69B4',
  purple: '#9B59B6',
  red: '#E74C3C',
  white: '#ECF0F1',
  yellow: '#F1C40F'
};

// Colors that need dark text for readability
const LIGHT_COLORS = ['white', 'yellow', 'pink'];

// Language support
const LANGUAGE_FLAGS = {
  en: 'https://flagcdn.com/w40/gb.png',
  de: 'https://flagcdn.com/w40/de.png',
  es: 'https://flagcdn.com/w40/es.png',
  fr: 'https://flagcdn.com/w40/fr.png',
  ja: 'https://flagcdn.com/w40/jp.png',
  ko: 'https://flagcdn.com/w40/kr.png'
};

const LANGUAGE_NAMES = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어'
};

// ===== DOM ELEMENTS =====
const loadingScreen = document.getElementById('loading-screen');
const appContainer = document.getElementById('app-container');
const pokemonGrid = document.getElementById('pokemon-grid');
const progressFill = document.getElementById('progress-fill');
const loadingText = document.getElementById('loading-text');
const resetBtn = document.getElementById('reset-btn');
const nameSearchInput = document.getElementById('name-search');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const modalClose = document.querySelector('.modal-close');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const chosenPokemonDisplay = document.getElementById('chosen-pokemon-display');
const remainingCounter = document.getElementById('remaining-counter');

// ===== INITIALIZATION =====
async function init() {
  try {
    showLoading();

    // Step 1: Fetch generation mappings
    await fetchGenerationMappings();

    // Step 2: Fetch all Pokemon list
    const pokemonList = await fetchPokemonList();

    // Step 3: Fetch Pokemon details in batches
    await fetchPokemonDetailsBatch(pokemonList);

    // Step 4: Sort by Pokedex number
    state.allPokemon.sort((a, b) => a.id - b.id);
    state.displayedPokemon = [...state.allPokemon];

    // Step 5: Render Pokemon grid
    renderPokemonGrid();

    // Step 6: Setup event listeners
    setupEventListeners();

    // Step 7: Initialize chosen Pokemon display
    updateChosenPokemonDisplay();
    updateRemainingCounter();

    hideLoading();
  } catch (error) {
    console.error('Error initializing app:', error);
    loadingText.textContent = 'Error loading Pokemon. Please refresh.';
  }
}

// ===== API FUNCTIONS =====

// Fetch generation mappings (Gen 1-9)
async function fetchGenerationMappings() {
  const generationPromises = [];

  for (let i = 1; i <= 9; i++) {
    generationPromises.push(
      fetch(`${API_BASE}/generation/${i}`)
        .then(res => res.json())
        .then(data => {
          // Map each species to its generation number
          data.pokemon_species.forEach(species => {
            state.generationMap[species.name] = i;
          });
        })
        .catch(error => {
          console.warn(`Failed to fetch generation ${i}:`, error);
        })
    );
  }

  await Promise.all(generationPromises);
  updateProgress(10, 'Loaded generation data...');
}

// Fetch complete Pokemon list
async function fetchPokemonList() {
  updateProgress(15, 'Fetching Pokemon list...');

  const response = await fetch(`${API_BASE}/pokemon?limit=10000`);
  const data = await response.json();

  updateProgress(20, `Found ${data.results.length} Pokemon...`);
  return data.results;
}

// Fetch Pokemon details in batches
async function fetchPokemonDetailsBatch(pokemonList) {
  // Filter to only include Pokemon up to #1025 (Pecharunt)
  const filteredList = pokemonList.filter(pokemon => {
    // Extract ID from URL (e.g., "https://pokeapi.co/api/v2/pokemon/1/" -> 1)
    const urlParts = pokemon.url.split('/');
    const pokemonId = parseInt(urlParts[urlParts.length - 2]);
    return pokemonId <= MAX_POKEMON_ID;
  });

  const totalPokemon = filteredList.length;
  const batches = [];

  // Create batches
  for (let i = 0; i < totalPokemon; i += BATCH_SIZE) {
    batches.push(filteredList.slice(i, i + BATCH_SIZE));
  }

  // Process each batch sequentially to avoid overwhelming the API
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchPromises = batch.map(pokemon => fetchPokemonDetails(pokemon));

    const batchResults = await Promise.all(batchPromises);
    state.allPokemon.push(...batchResults.filter(p => p !== null));

    // Update progress
    const progress = 20 + ((i + 1) / batches.length) * 75;
    updateProgress(progress, `Loading Pokemon ${i * BATCH_SIZE + 1}-${Math.min((i + 1) * BATCH_SIZE, totalPokemon)}...`);
  }

  updateProgress(100, 'Loading complete!');
}

// Fetch individual Pokemon details
async function fetchPokemonDetails(pokemon) {
  try {
    const response = await fetch(pokemon.url);
    const data = await response.json();

    // Use a simple data URI placeholder if sprite is missing
    const placeholderSprite = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23ddd" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="24" fill="%23999"%3E?%3C/text%3E%3C/svg%3E';

    // Prefer showdown sprite (available for all Pokemon), fallback to front_default, then placeholder
    const sprite = data.sprites.other?.showdown?.front_default
      || data.sprites.front_default
      || placeholderSprite;

    // Fetch species data to get evolution stage and language names
    let evolutionStage = 1; // Default to Stage 1
    const names = {}; // Store names in different languages
    let isBaby = false;
    let isLegendary = false;
    let isMythical = false;
    let color = null;
    try {
      const speciesResponse = await fetch(data.species.url);
      const speciesData = await speciesResponse.json();

      // Extract names in different languages
      if (speciesData.names && Array.isArray(speciesData.names)) {
        speciesData.names.forEach(nameEntry => {
          const langCode = nameEntry.language.name;
          // Only store target languages
          if (['en', 'de', 'es', 'fr', 'ja', 'ko'].includes(langCode)) {
            names[langCode] = nameEntry.name;
          }
        });
      }

      // Extract special category flags
      isBaby = speciesData.is_baby || false;
      isLegendary = speciesData.is_legendary || false;
      isMythical = speciesData.is_mythical || false;

      // Extract color
      if (speciesData.color && speciesData.color.name) {
        color = speciesData.color.name;
      }

      if (speciesData.evolves_from_species) {
        // This Pokemon evolves from another, so it's at least Stage 2
        // Fetch the species it evolves from to determine if it's Stage 2 or 3
        const prevSpeciesResponse = await fetch(speciesData.evolves_from_species.url);
        const prevSpeciesData = await prevSpeciesResponse.json();

        if (prevSpeciesData.evolves_from_species) {
          // The previous Pokemon also evolved from something, so this is Stage 3
          evolutionStage = 3;
        } else {
          // The previous Pokemon is base, so this is Stage 2
          evolutionStage = 2;
        }
      }
    } catch (error) {
      console.warn(`Could not determine evolution stage for ${pokemon.name}:`, error);
    }

    return {
      id: data.id,
      name: data.name,
      names: names,  // Language-specific names
      sprite: sprite,
      types: data.types.map(t => t.type.name),
      generation: state.generationMap[data.species.name] || 1,
      evolutionStage: evolutionStage,
      isBaby: isBaby,              // Baby Pokemon flag
      isLegendary: isLegendary,    // Legendary Pokemon flag
      isMythical: isMythical,      // Mythical Pokemon flag
      color: color                 // Pokemon color
    };
  } catch (error) {
    console.error(`Error fetching ${pokemon.name}:`, error);
    return null;
  }
}

// Get Pokemon name in current language
function getDisplayName(pokemon) {
  if (!pokemon.names || !pokemon.names[state.currentLanguage]) {
    return pokemon.name; // Fallback to default name
  }
  return pokemon.names[state.currentLanguage];
}

// ===== RENDERING FUNCTIONS =====

function renderPokemonGrid() {
  pokemonGrid.innerHTML = '';

  state.displayedPokemon.forEach(pokemon => {
    const card = createPokemonCard(pokemon);
    pokemonGrid.appendChild(card);
  });

  updateRemainingCounter();
}

function createPokemonCard(pokemon) {
  const card = document.createElement('div');
  card.className = 'pokemon-card';
  card.dataset.id = pokemon.id;

  if (state.disabledPokemon.has(pokemon.id)) {
    card.classList.add('disabled');
  }

  const isChosen = state.chosenPokemonId === pokemon.id;
  const shouldDisableStarBtn = state.chosenPokemonId !== null && !isChosen;

  card.innerHTML = `
    <button class="star-btn ${isChosen ? 'active' : ''}" data-pokemon-id="${pokemon.id}" title="Choose this Pokemon" ${shouldDisableStarBtn ? 'disabled' : ''}>
      &#9733;
    </button>
    <div class="pokemon-number">#${String(pokemon.id).padStart(3, '0')}</div>
    <div class="pokemon-generation">${ROMAN_NUMERALS[pokemon.generation] || 'I'}</div>
    <img src="${pokemon.sprite}" alt="${getDisplayName(pokemon)}" class="pokemon-sprite">
    <div class="pokemon-name">${getDisplayName(pokemon)}</div>
    <div class="pokemon-types">
      ${pokemon.types.map(type => `<span class="type-badge" style="background-color: ${TYPE_COLORS[type] || '#667eea'}">${type}</span>`).join('')}
    </div>
  `;

  // Star button click handler
  const starBtn = card.querySelector('.star-btn');
  starBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent card click from firing
    chooseIdentity(pokemon.id);
  });

  // Card click handler (for disabling)
  card.addEventListener('click', () => togglePokemon(pokemon.id));

  return card;
}

// ===== FILTER FUNCTIONS =====

function filterPokemon() {
  let filtered = [...state.allPokemon];

  // Filter by name
  if (state.currentFilters.name) {
    const searchTerm = state.currentFilters.name.toLowerCase();
    filtered = filtered.filter(p => {
      // Search in current language
      const currentLangName = getDisplayName(p).toLowerCase();
      if (currentLangName.includes(searchTerm)) return true;

      // Also search in English for consistency
      if (p.name.toLowerCase().includes(searchTerm)) return true;

      return false;
    });
  }

  // Filter by generation
  if (state.currentFilters.generations.size > 0) {
    filtered = filtered.filter(p => state.currentFilters.generations.has(p.generation));
  }

  // Exclude NOT generations
  if (state.currentFilters.notGenerations.size > 0) {
    filtered = filtered.filter(p => !state.currentFilters.notGenerations.has(p.generation));
  }

  // Filter by type (AND mode: Pokemon must have ALL selected types)
  if (state.currentFilters.types.size > 0) {
    filtered = filtered.filter(p =>
      [...state.currentFilters.types].every(type => p.types.includes(type))
    );
  }

  // Exclude NOT types
  if (state.currentFilters.notTypes.size > 0) {
    filtered = filtered.filter(p =>
      !p.types.some(type => state.currentFilters.notTypes.has(type))
    );
  }

  // Filter by type count (single = 1 type, dual = 2 types)
  if (state.currentFilters.typeCount.size > 0) {
    filtered = filtered.filter(p => {
      const typeCount = p.types.length;
      return (state.currentFilters.typeCount.has('single') && typeCount === 1) ||
             (state.currentFilters.typeCount.has('dual') && typeCount === 2);
    });
  }

  // Exclude NOT type counts
  if (state.currentFilters.notTypeCount.size > 0) {
    filtered = filtered.filter(p => {
      const typeCount = p.types.length;
      return !(state.currentFilters.notTypeCount.has('single') && typeCount === 1) &&
             !(state.currentFilters.notTypeCount.has('dual') && typeCount === 2);
    });
  }

  // Filter by evolution stage
  if (state.currentFilters.evolutionStages.size > 0) {
    filtered = filtered.filter(p => state.currentFilters.evolutionStages.has(p.evolutionStage));
  }

  // Exclude NOT evolution stages
  if (state.currentFilters.notEvolutionStages.size > 0) {
    filtered = filtered.filter(p => !state.currentFilters.notEvolutionStages.has(p.evolutionStage));
  }

  // Filter by special categories (baby, legendary, mythical) - OR logic
  if (state.currentFilters.specialCategories.size > 0) {
    filtered = filtered.filter(p => {
      // Pokemon must match AT LEAST ONE selected category
      if (state.currentFilters.specialCategories.has('baby') && p.isBaby) return true;
      if (state.currentFilters.specialCategories.has('legendary') && p.isLegendary) return true;
      if (state.currentFilters.specialCategories.has('mythical') && p.isMythical) return true;
      return false;
    });
  }

  // Exclude NOT special categories
  if (state.currentFilters.notSpecialCategories.size > 0) {
    filtered = filtered.filter(p => {
      // Exclude Pokemon matching ANY excluded category
      if (state.currentFilters.notSpecialCategories.has('baby') && p.isBaby) return false;
      if (state.currentFilters.notSpecialCategories.has('legendary') && p.isLegendary) return false;
      if (state.currentFilters.notSpecialCategories.has('mythical') && p.isMythical) return false;
      return true;
    });
  }

  // Filter by color (OR logic: match AT LEAST ONE selected color)
  if (state.currentFilters.colors.size > 0) {
    filtered = filtered.filter(p =>
      p.color && state.currentFilters.colors.has(p.color)
    );
  }

  // Exclude NOT colors
  if (state.currentFilters.notColors.size > 0) {
    filtered = filtered.filter(p =>
      !p.color || !state.currentFilters.notColors.has(p.color)
    );
  }

  state.displayedPokemon = filtered;
  renderPokemonGrid();
}

// ===== EVENT HANDLERS =====

function togglePokemon(pokemonId) {
  if (state.disabledPokemon.has(pokemonId)) {
    state.disabledPokemon.delete(pokemonId);
  } else {
    state.disabledPokemon.add(pokemonId);
  }

  renderPokemonGrid();
}

function chooseIdentity(pokemonId) {
  // If clicking the same Pokemon, unselect it
  if (state.chosenPokemonId === pokemonId) {
    state.chosenPokemonId = null;
    updateChosenPokemonDisplay();
  } else {
    // Otherwise, select this Pokemon (overwrites previous selection)
    state.chosenPokemonId = pokemonId;
    updateChosenPokemonDisplay();
  }

  // Re-render grid to update star states
  renderPokemonGrid();
}

function updateChosenPokemonDisplay() {
  if (!state.chosenPokemonId) {
    chosenPokemonDisplay.innerHTML = `
      <span class="no-choice">Choose your Pokemon</span>
      <button id="random-pokemon-btn" class="random-btn" title="Choose Random Pokemon">🎲</button>
    `;

    // Re-attach event listener after innerHTML change
    const randomBtn = document.getElementById('random-pokemon-btn');
    if (randomBtn) {
      randomBtn.addEventListener('click', chooseRandomPokemon);
    }
    return;
  }

  const pokemon = state.allPokemon.find(p => p.id === state.chosenPokemonId);
  if (pokemon) {
    chosenPokemonDisplay.innerHTML = `
      <img src="${pokemon.sprite}" alt="${getDisplayName(pokemon)}" class="chosen-sprite">
      <div class="chosen-info">
        <span class="chosen-name">${getDisplayName(pokemon)}</span>
        <div class="chosen-details">
          <span class="chosen-generation">${ROMAN_NUMERALS[pokemon.generation] || 'I'}</span>
          <div class="chosen-types">
            ${pokemon.types.map(type => `<span class="chosen-type-badge" style="background-color: ${TYPE_COLORS[type] || '#667eea'}">${type}</span>`).join('')}
          </div>
        </div>
      </div>
      <button id="clear-chosen-btn" class="clear-chosen-btn" title="Clear Selection">&times;</button>
    `;

    // Re-attach event listener for clear button
    const clearBtn = document.getElementById('clear-chosen-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.chosenPokemonId = null;
        updateChosenPokemonDisplay();
        renderPokemonGrid();
      });
    }
  }
}

function chooseRandomPokemon() {
  // Filter out disabled Pokemon from displayed list
  const availablePokemon = state.displayedPokemon.filter(pokemon =>
    !state.disabledPokemon.has(pokemon.id)
  );

  // If no Pokemon available, do nothing
  if (availablePokemon.length === 0) {
    return;
  }

  // Select random Pokemon from available list
  const randomIndex = Math.floor(Math.random() * availablePokemon.length);
  const randomPokemon = availablePokemon[randomIndex];

  // Use existing chooseIdentity function
  chooseIdentity(randomPokemon.id);
}

function updateRemainingCounter() {
  // Count Pokemon that are displayed AND not disabled
  const remainingCount = state.displayedPokemon.filter(pokemon =>
    !state.disabledPokemon.has(pokemon.id)
  ).length;

  const counterValue = remainingCounter.querySelector('.counter-value');
  counterValue.textContent = remainingCount;
}

function resetAllPokemon() {
  // Clear disabled Pokemon
  state.disabledPokemon.clear();

  // Clear chosen Pokemon
  state.chosenPokemonId = null;
  updateChosenPokemonDisplay();

  // Reset filters
  state.currentFilters.generations.clear();
  state.currentFilters.notGenerations.clear();
  state.currentFilters.types.clear();
  state.currentFilters.notTypes.clear();
  state.currentFilters.typeCount.clear();
  state.currentFilters.notTypeCount.clear();
  state.currentFilters.evolutionStages.clear();
  state.currentFilters.notEvolutionStages.clear();
  state.currentFilters.specialCategories.clear();
  state.currentFilters.notSpecialCategories.clear();
  state.currentFilters.colors.clear();
  state.currentFilters.notColors.clear();
  state.currentFilters.name = '';
  nameSearchInput.value = '';

  // Reset UI buttons
  document.querySelectorAll('[data-generation]').forEach(b => {
    b.classList.remove('active', 'not');
  });
  document.querySelector('[data-generation="all"]')?.classList.add('active');

  document.querySelectorAll('[data-type]').forEach(b => {
    b.classList.remove('active', 'not');
  });
  document.querySelector('[data-type="all"]')?.classList.add('active');

  // Reset type count toggle
  const typeCountToggle = document.getElementById('type-count-toggle');
  if (typeCountToggle) {
    typeCountToggle.textContent = 'Single+Dual';
  }

  document.querySelectorAll('[data-evolution]').forEach(b => {
    b.classList.remove('active', 'not');
  });
  document.querySelector('[data-evolution="all"]')?.classList.add('active');

  document.querySelectorAll('[data-special]').forEach(b => {
    b.classList.remove('active', 'not');
  });

  document.querySelectorAll('[data-color]').forEach(b => {
    b.classList.remove('active', 'not');
  });

  // Re-render
  filterPokemon();
}

function setupEventListeners() {
  // Reset button
  resetBtn.addEventListener('click', resetAllPokemon);

  // Dark mode toggle
  darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    sunIcon.classList.toggle('hidden');
    moonIcon.classList.toggle('hidden');

    // Save preference to localStorage
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
  });

  // Load dark mode preference
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  if (savedDarkMode) {
    document.body.classList.add('dark-mode');
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
  }

  // Info modal
  infoBtn.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });

  modalClose.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
    }
  });

  // Language selector dropdown
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  const langDropdown = document.getElementById('lang-dropdown');
  const currentLangFlag = document.getElementById('current-lang-flag');

  // Toggle dropdown
  langToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('hidden');
  });

  // Language selection
  document.querySelectorAll('.lang-option').forEach(option => {
    option.addEventListener('click', (e) => {
      const selectedLang = e.currentTarget.dataset.lang;

      // Update state
      state.currentLanguage = selectedLang;

      // Update flag display
      currentLangFlag.src = LANGUAGE_FLAGS[selectedLang];
      currentLangFlag.alt = LANGUAGE_NAMES[selectedLang];

      // Save preference to localStorage
      localStorage.setItem('selectedLanguage', selectedLang);

      // Close dropdown
      langDropdown.classList.add('hidden');

      // Re-render to show new language
      renderPokemonGrid();
      updateChosenPokemonDisplay();
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!langToggleBtn.contains(e.target) && !langDropdown.contains(e.target)) {
      langDropdown.classList.add('hidden');
    }
  });

  // Load saved language preference on init
  const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
  state.currentLanguage = savedLanguage;
  currentLangFlag.src = LANGUAGE_FLAGS[savedLanguage];
  currentLangFlag.alt = LANGUAGE_NAMES[savedLanguage];

  // Name search input
  nameSearchInput.addEventListener('input', (e) => {
    state.currentFilters.name = e.target.value;
    filterPokemon();
  });

  // Collapsible filter sections
  document.querySelectorAll('.filter-section-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const section = e.target.closest('.filter-section');
      section.classList.toggle('collapsed');
    });
  });


  // Generation filters (multiple selection enabled)
  document.querySelectorAll('[data-generation]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedGen = e.currentTarget.dataset.generation;

      if (clickedGen === 'all') {
        // Clear all generation selections and NOT selections
        state.currentFilters.generations.clear();
        state.currentFilters.notGenerations.clear();
        document.querySelectorAll('[data-generation]').forEach(b => b.classList.remove('active', 'not'));
        e.target.classList.add('active');
      } else {
        const genNumber = parseInt(clickedGen);
        const isActive = state.currentFilters.generations.has(genNumber);
        const isNot = state.currentFilters.notGenerations.has(genNumber);

        // Remove "All" button active state
        document.querySelector('[data-generation="all"]').classList.remove('active');

        // Cycle through states: unselected → active → not → unselected
        if (!isActive && !isNot) {
          // Unselected → Active
          state.currentFilters.generations.add(genNumber);
          e.currentTarget.classList.add('active');
        } else if (isActive) {
          // Active → NOT
          state.currentFilters.generations.delete(genNumber);
          state.currentFilters.notGenerations.add(genNumber);
          e.currentTarget.classList.remove('active');
          e.currentTarget.classList.add('not');
        } else if (isNot) {
          // NOT → Unselected
          state.currentFilters.notGenerations.delete(genNumber);
          e.currentTarget.classList.remove('not');

          // If no generations selected or excluded, activate "All"
          if (state.currentFilters.generations.size === 0 && state.currentFilters.notGenerations.size === 0) {
            document.querySelector('[data-generation="all"]').classList.add('active');
          }
        }
      }

      filterPokemon();
    });
  });

  // Type filters - support multiple selection
  document.querySelectorAll('[data-type]').forEach(btn => {
    const type = btn.dataset.type;

    // Apply type color to filter buttons
    if (type !== 'all' && TYPE_COLORS[type]) {
      btn.style.setProperty('--type-color', TYPE_COLORS[type]);
      btn.classList.add('type-colored');
    }

    btn.addEventListener('click', (e) => {
      const clickedType = e.currentTarget.dataset.type;

      if (clickedType === 'all') {
        // Clear all type selections and NOT selections
        state.currentFilters.types.clear();
        state.currentFilters.notTypes.clear();
        document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active', 'not'));
        e.target.classList.add('active');
      } else {
        const isActive = state.currentFilters.types.has(clickedType);
        const isNot = state.currentFilters.notTypes.has(clickedType);

        // Remove "All" button active state
        document.querySelector('[data-type="all"]').classList.remove('active');

        // Cycle through states: unselected → active → not → unselected
        if (!isActive && !isNot) {
          // Unselected → Active
          state.currentFilters.types.add(clickedType);
          e.currentTarget.classList.add('active');
        } else if (isActive) {
          // Active → NOT
          state.currentFilters.types.delete(clickedType);
          state.currentFilters.notTypes.add(clickedType);
          e.currentTarget.classList.remove('active');
          e.currentTarget.classList.add('not');
        } else if (isNot) {
          // NOT → Unselected
          state.currentFilters.notTypes.delete(clickedType);
          e.currentTarget.classList.remove('not');

          // If no types selected or excluded, activate "All"
          if (state.currentFilters.types.size === 0 && state.currentFilters.notTypes.size === 0) {
            document.querySelector('[data-type="all"]').classList.add('active');
          }
        }
      }

      filterPokemon();
    });
  });

  // Type Count filter (single 3-state toggle button)
  const typeCountToggle = document.getElementById('type-count-toggle');
  if (typeCountToggle) {
    let typeCountState = 'both'; // 'both', 'single', 'dual'

    typeCountToggle.addEventListener('click', () => {
      // Clear previous state
      state.currentFilters.typeCount.clear();

      // Cycle through states
      if (typeCountState === 'both') {
        typeCountState = 'single';
        typeCountToggle.textContent = 'Single';
        state.currentFilters.typeCount.add('single');
      } else if (typeCountState === 'single') {
        typeCountState = 'dual';
        typeCountToggle.textContent = 'Dual';
        state.currentFilters.typeCount.add('dual');
      } else {
        typeCountState = 'both';
        typeCountToggle.textContent = 'Single+Dual';
        state.currentFilters.typeCount.clear();
      }

      filterPokemon();
    });
  }

  // Evolution Stage filters (3-state toggle)
  document.querySelectorAll('[data-evolution]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedStage = e.currentTarget.dataset.evolution;

      if (clickedStage === 'all') {
        // Clear all evolution stage selections and NOT selections
        state.currentFilters.evolutionStages.clear();
        state.currentFilters.notEvolutionStages.clear();
        document.querySelectorAll('[data-evolution]').forEach(b => b.classList.remove('active', 'not'));
        e.target.classList.add('active');
      } else {
        const stageNumber = parseInt(clickedStage);
        const isActive = state.currentFilters.evolutionStages.has(stageNumber);
        const isNot = state.currentFilters.notEvolutionStages.has(stageNumber);

        // Remove "All" button active state
        document.querySelector('[data-evolution="all"]').classList.remove('active');

        // Cycle through states: unselected → active → not → unselected
        if (!isActive && !isNot) {
          // Unselected → Active
          state.currentFilters.evolutionStages.add(stageNumber);
          e.currentTarget.classList.add('active');
        } else if (isActive) {
          // Active → NOT
          state.currentFilters.evolutionStages.delete(stageNumber);
          state.currentFilters.notEvolutionStages.add(stageNumber);
          e.currentTarget.classList.remove('active');
          e.currentTarget.classList.add('not');
        } else if (isNot) {
          // NOT → Unselected
          state.currentFilters.notEvolutionStages.delete(stageNumber);
          e.currentTarget.classList.remove('not');

          // If no stages selected or excluded, activate "All"
          if (state.currentFilters.evolutionStages.size === 0 && state.currentFilters.notEvolutionStages.size === 0) {
            document.querySelector('[data-evolution="all"]').classList.add('active');
          }
        }
      }

      filterPokemon();
    });
  });

  // Special Categories filters (3-state toggle)
  document.querySelectorAll('[data-special]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedCategory = e.currentTarget.dataset.special;
      const isActive = state.currentFilters.specialCategories.has(clickedCategory);
      const isNot = state.currentFilters.notSpecialCategories.has(clickedCategory);

      // Cycle: unselected → active → not → unselected
      if (!isActive && !isNot) {
        // Unselected → Active
        state.currentFilters.specialCategories.add(clickedCategory);
        e.currentTarget.classList.add('active');
      } else if (isActive) {
        // Active → NOT
        state.currentFilters.specialCategories.delete(clickedCategory);
        state.currentFilters.notSpecialCategories.add(clickedCategory);
        e.currentTarget.classList.remove('active');
        e.currentTarget.classList.add('not');
      } else if (isNot) {
        // NOT → Unselected
        state.currentFilters.notSpecialCategories.delete(clickedCategory);
        e.currentTarget.classList.remove('not');
      }

      filterPokemon();
    });
  });

  // Color filters (3-state toggle with OR logic)
  document.querySelectorAll('[data-color]').forEach(btn => {
    const color = btn.dataset.color;

    // Apply color to filter buttons
    if (COLOR_COLORS[color]) {
      btn.style.setProperty('--type-color', COLOR_COLORS[color]);
      btn.classList.add('color-colored');

      // Add light-text class for colors that need dark text
      if (LIGHT_COLORS.includes(color)) {
        btn.classList.add('light-text');
      }
    }

    btn.addEventListener('click', (e) => {
      const clickedColor = e.currentTarget.dataset.color;
      const isActive = state.currentFilters.colors.has(clickedColor);
      const isNot = state.currentFilters.notColors.has(clickedColor);

      // Cycle: unselected → active → not → unselected
      if (!isActive && !isNot) {
        state.currentFilters.colors.add(clickedColor);
        e.currentTarget.classList.add('active');
      } else if (isActive) {
        state.currentFilters.colors.delete(clickedColor);
        state.currentFilters.notColors.add(clickedColor);
        e.currentTarget.classList.remove('active');
        e.currentTarget.classList.add('not');
      } else if (isNot) {
        state.currentFilters.notColors.delete(clickedColor);
        e.currentTarget.classList.remove('not');
      }

      filterPokemon();
    });
  });
}

// ===== UTILITY FUNCTIONS =====

function updateProgress(percentage, text) {
  progressFill.style.width = `${percentage}%`;
  loadingText.textContent = `${Math.round(percentage)}% - ${text}`;
}

function showLoading() {
  loadingScreen.classList.remove('hidden');
  appContainer.classList.add('hidden');
}

function hideLoading() {
  loadingScreen.classList.add('hidden');
  appContainer.classList.remove('hidden');
}

// ===== START APPLICATION =====
document.addEventListener('DOMContentLoaded', init);
