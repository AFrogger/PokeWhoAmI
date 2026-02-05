// ===== STATE MANAGEMENT =====
const state = {
  allPokemon: [],           // Full Pokemon dataset
  displayedPokemon: [],     // Filtered Pokemon
  disabledPokemon: new Set(), // Set of disabled Pokemon IDs
  chosenPokemonId: null,    // The user's chosen Pokemon (their identity)
  generationMap: {},        // Map: pokemon-species-name -> generation-number
  currentFilters: {
    generations: new Set(), // Set of selected generations (empty = all)
    notGenerations: new Set(), // Set of excluded generations (NOT state)
    generationMode: 'single', // 'single' or 'multiple'
    types: new Set(),       // Set of selected types (empty = all types)
    notTypes: new Set(),    // Set of excluded types (NOT state)
    typeMode: 'or',         // 'or' or 'and'
    name: ''                // Name search string
  }
};

// ===== CONSTANTS =====
const API_BASE = 'https://pokeapi.co/api/v2';
const BATCH_SIZE = 30; // Fetch Pokemon in batches of 30
const MAX_POKEMON_ID = 1025; // Stop at Pecharunt, exclude alternate forms

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

// ===== DOM ELEMENTS =====
const loadingScreen = document.getElementById('loading-screen');
const appContainer = document.getElementById('app-container');
const pokemonGrid = document.getElementById('pokemon-grid');
const progressFill = document.getElementById('progress-fill');
const loadingText = document.getElementById('loading-text');
const resetBtn = document.getElementById('reset-btn');
const nameSearchInput = document.getElementById('name-search');
const genModeToggle = document.getElementById('gen-mode-toggle');
const typeModeToggle = document.getElementById('type-mode-toggle');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const modalClose = document.querySelector('.modal-close');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const chosenPokemonDisplay = document.getElementById('chosen-pokemon-display');

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

    return {
      id: data.id,
      name: data.name,
      sprite: sprite,
      types: data.types.map(t => t.type.name),
      generation: state.generationMap[data.species.name] || 1
    };
  } catch (error) {
    console.error(`Error fetching ${pokemon.name}:`, error);
    return null;
  }
}

// ===== RENDERING FUNCTIONS =====

function renderPokemonGrid() {
  pokemonGrid.innerHTML = '';

  state.displayedPokemon.forEach(pokemon => {
    const card = createPokemonCard(pokemon);
    pokemonGrid.appendChild(card);
  });
}

function createPokemonCard(pokemon) {
  const card = document.createElement('div');
  card.className = 'pokemon-card';
  card.dataset.id = pokemon.id;

  if (state.disabledPokemon.has(pokemon.id)) {
    card.classList.add('disabled');
  }

  const isChosen = state.chosenPokemonId === pokemon.id;

  card.innerHTML = `
  <button class="star-btn ${isChosen ? 'active' : ''}" data-pokemon-id="${pokemon.id}" title="Choose this Pokemon">
    &#9733;
  </button>
    <div class="pokemon-number">#${String(pokemon.id).padStart(3, '0')}</div>
    <img src="${pokemon.sprite}" alt="${pokemon.name}" class="pokemon-sprite">
    <div class="pokemon-name">${pokemon.name}</div>
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
    filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));
  }

  // Filter by generation
  if (state.currentFilters.generations.size > 0) {
    filtered = filtered.filter(p => state.currentFilters.generations.has(p.generation));
  }

  // Exclude NOT generations
  if (state.currentFilters.notGenerations.size > 0) {
    filtered = filtered.filter(p => !state.currentFilters.notGenerations.has(p.generation));
  }

  // Filter by type
  if (state.currentFilters.types.size > 0) {
    if (state.currentFilters.typeMode === 'and') {
      // AND mode: Pokemon must have ALL selected types
      filtered = filtered.filter(p =>
        [...state.currentFilters.types].every(type => p.types.includes(type))
      );
    } else {
      // OR mode: Pokemon must have at least ONE selected type
      filtered = filtered.filter(p =>
        p.types.some(type => state.currentFilters.types.has(type))
      );
    }
  }

  // Exclude NOT types
  if (state.currentFilters.notTypes.size > 0) {
    filtered = filtered.filter(p =>
      !p.types.some(type => state.currentFilters.notTypes.has(type))
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
    chosenPokemonDisplay.innerHTML = '<span class="no-choice">Choose your Pokemon</span>';
    return;
  }

const pokemon = state.allPokemon.find(p => p.id === state.chosenPokemonId);
if (pokemon) {
  chosenPokemonDisplay.innerHTML = `
    <img src="${pokemon.sprite}" alt="${pokemon.name}" class="chosen-sprite">
    <span class="chosen-name" style="text-transform: capitalize;">${pokemon.name}</span>
  `;
}

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
  state.currentFilters.name = '';
  nameSearchInput.value = '';

  // Reset UI buttons
  document.querySelectorAll('[data-generation]').forEach(b => {
    b.classList.remove('active', 'not');
  });
  document.querySelector('[data-generation="all"]').classList.add('active');

  document.querySelectorAll('[data-type]').forEach(b => {
    b.classList.remove('active', 'not');
  });
  document.querySelector('[data-type="all"]').classList.add('active');

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

  // Generation mode toggle
  genModeToggle.addEventListener('click', () => {
    if (state.currentFilters.generationMode === 'single') {
      state.currentFilters.generationMode = 'multiple';
      genModeToggle.querySelector('.mode-label').textContent = 'Multiple';
    } else {
      state.currentFilters.generationMode = 'single';
      genModeToggle.querySelector('.mode-label').textContent = 'Single';
      // When switching to single mode, keep only the first selected generation and clear NOT states
      const totalSelections = state.currentFilters.generations.size + state.currentFilters.notGenerations.size;
      if (totalSelections > 1) {
        const firstGen = [...state.currentFilters.generations][0];
        const firstNotGen = [...state.currentFilters.notGenerations][0];

        state.currentFilters.generations.clear();
        state.currentFilters.notGenerations.clear();

        // Update UI
        document.querySelectorAll('[data-generation]').forEach(b => {
          if (b.dataset.generation !== 'all') {
            b.classList.remove('active', 'not');
          }
        });

        // Keep the first selection or NOT state
        if (firstGen) {
          state.currentFilters.generations.add(firstGen);
          document.querySelector(`[data-generation="${firstGen}"]`)?.classList.add('active');
        } else if (firstNotGen) {
          state.currentFilters.notGenerations.add(firstNotGen);
          document.querySelector(`[data-generation="${firstNotGen}"]`)?.classList.add('not');
        }
      }
    }
    filterPokemon();
  });

  // Type mode toggle
  typeModeToggle.addEventListener('click', () => {
    if (state.currentFilters.typeMode === 'or') {
      state.currentFilters.typeMode = 'and';
      typeModeToggle.querySelector('.mode-label').textContent = 'AND';
    } else {
      state.currentFilters.typeMode = 'or';
      typeModeToggle.querySelector('.mode-label').textContent = 'OR';
    }
    filterPokemon();
  });

  // Generation filters
  document.querySelectorAll('[data-generation]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedGen = e.target.dataset.generation;

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

        if (state.currentFilters.generationMode === 'single') {
          // Single mode: clear all and set this one's state
          state.currentFilters.generations.clear();
          state.currentFilters.notGenerations.clear();
          document.querySelectorAll('[data-generation]').forEach(b => b.classList.remove('active', 'not'));
          document.querySelector('[data-generation="all"]').classList.remove('active');

          // Cycle through states: unselected → active → not → unselected
          if (!isActive && !isNot) {
            // Unselected → Active
            state.currentFilters.generations.add(genNumber);
            e.target.classList.add('active');
          } else if (isActive) {
            // Active → NOT
            state.currentFilters.generations.delete(genNumber);
            state.currentFilters.notGenerations.add(genNumber);
            e.target.classList.remove('active');
            e.target.classList.add('not');
          } else if (isNot) {
            // NOT → Unselected
            state.currentFilters.notGenerations.delete(genNumber);
            e.target.classList.remove('not');
            // Activate "All" since nothing is selected
            document.querySelector('[data-generation="all"]').classList.add('active');
          }
        } else {
          // Multiple mode: cycle through states for this button
          document.querySelector('[data-generation="all"]').classList.remove('active');

          // Cycle through states: unselected → active → not → unselected
          if (!isActive && !isNot) {
            // Unselected → Active
            state.currentFilters.generations.add(genNumber);
            e.target.classList.add('active');
          } else if (isActive) {
            // Active → NOT
            state.currentFilters.generations.delete(genNumber);
            state.currentFilters.notGenerations.add(genNumber);
            e.target.classList.remove('active');
            e.target.classList.add('not');
          } else if (isNot) {
            // NOT → Unselected
            state.currentFilters.notGenerations.delete(genNumber);
            e.target.classList.remove('not');

            // If no generations selected or excluded, activate "All"
            if (state.currentFilters.generations.size === 0 && state.currentFilters.notGenerations.size === 0) {
              document.querySelector('[data-generation="all"]').classList.add('active');
            }
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
      const clickedType = e.target.dataset.type;

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
          e.target.classList.add('active');
        } else if (isActive) {
          // Active → NOT
          state.currentFilters.types.delete(clickedType);
          state.currentFilters.notTypes.add(clickedType);
          e.target.classList.remove('active');
          e.target.classList.add('not');
        } else if (isNot) {
          // NOT → Unselected
          state.currentFilters.notTypes.delete(clickedType);
          e.target.classList.remove('not');

          // If no types selected or excluded, activate "All"
          if (state.currentFilters.types.size === 0 && state.currentFilters.notTypes.size === 0) {
            document.querySelector('[data-type="all"]').classList.add('active');
          }
        }
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
