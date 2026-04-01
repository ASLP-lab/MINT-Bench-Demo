const searchInput = document.getElementById("searchInput");
const languageButtons = Array.from(document.querySelectorAll("#languageFilters .filter-btn"));
const splitButtons = Array.from(document.querySelectorAll("#splitFilters .filter-btn"));
const sampleItems = Array.from(document.querySelectorAll(".sample-item"));
const emptyState = document.getElementById("emptyState");

let currentLanguage = "all";
let currentSplit = "all";

function setActive(buttons, activeButton) {
  buttons.forEach((button) => button.classList.remove("active"));
  activeButton.classList.add("active");
}

function matchesFilter(item, query, language, split) {
  const itemLanguage = item.dataset.language || "";
  const itemSplit = item.dataset.split || "";
  const itemSearch = (item.dataset.search || "").toLowerCase();

  const hitLanguage = language === "all" || itemLanguage === language;
  const hitSplit = split === "all" || itemSplit === split;
  const hitQuery = !query || itemSearch.includes(query.toLowerCase());

  return hitLanguage && hitSplit && hitQuery;
}

function renderFilters() {
  const query = searchInput ? searchInput.value.trim() : "";
  let visibleCount = 0;

  sampleItems.forEach((item) => {
    const visible = matchesFilter(item, query, currentLanguage, currentSplit);
    item.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  });

  if (emptyState) {
    emptyState.classList.toggle("hidden", visibleCount > 0);
  }
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = button.dataset.filter || "all";
    setActive(languageButtons, button);
    renderFilters();
  });
});

splitButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentSplit = button.dataset.split || "all";
    setActive(splitButtons, button);
    renderFilters();
  });
});

if (searchInput) {
  searchInput.addEventListener("input", renderFilters);
}

renderFilters();