  import {
        auth,
        db,
        ADMIN_UID
    } from "./firebase.js";

    import {
        onAuthStateChanged,
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword,
        signOut,
        sendPasswordResetEmail,
        updatePassword,
        deleteUser,
        reauthenticateWithCredential,
        EmailAuthProvider
    } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


    /* =========================================================
       CONFIG
    ========================================================= */

    const TAGS = [
        "Abandoned",
        "Rooftop",
        "Security on site",
        "Security checks on site frequently",
        "Alarmed"
    ];

    /*
        Approximate UK bounding box.

        This is deliberately broad enough to include
        Great Britain and Northern Ireland.
    */

    const UK_BOUNDS = {
        minLat: 49.8,
        maxLat: 60.9,
        minLng: -8.7,
        maxLng: 1.9
    };


    /* =========================================================
       STATE
    ========================================================= */

    let allLocations = [];
    let markers = [];

    let activeFilter = "all";
    let searchTerm = "";

    let currentUser = null;
    let currentUsername = "";

    let locationModalMode = "add";
    let editingLocationId = null;

    let selectedLatLng = null;
    let adminMarker = null;

let currentUserSavedLocations = [];
let currentUserViewedLocations = [];
let currentUserExploredLocations = [];

let exploreViewMode = "saved";
let exploreSearchTerm = "";


    /* =========================================================
       DOM
    ========================================================= */

    const locationsElement =
        document.getElementById("locations");

    const resultCount =
        document.getElementById("resultCount");

    const navbarSearch =
        document.getElementById("navbarSearch");

    const searchWrapper =
        document.getElementById("searchWrapper");

    const accountSidebar =
        document.getElementById("accountSidebar");
        

    const sidebarOverlay =
        document.getElementById("sidebarOverlay");


    /* =========================================================
       MAP
    ========================================================= */

    const map = L.map("map", {
        minZoom: 5,
        maxZoom: 18
    }).setView(
        [54.5, -3],
        6
    );

    // ==========================================
// ADMIN LOCATION PICKER MAP
// ==========================================

const locationPickerMap =
    L.map("locationPickerMap", {
        minZoom: 5,
        maxZoom: 18
    }).setView(
        [54.5, -3],
        6
    );





    /* =========================================================
       UK CHECK
    ========================================================= */

    function isUKCoordinate(lat, lng) {

        return (
            lat >= UK_BOUNDS.minLat &&
            lat <= UK_BOUNDS.maxLat &&
            lng >= UK_BOUNDS.minLng &&
            lng <= UK_BOUNDS.maxLng
        );
    }


    /* =========================================================
       TOAST
    ========================================================= */

    function toast(message) {

        const element =
            document.createElement("div");

        element.className = "toast";
        element.textContent = message;

        document
            .getElementById("toastContainer")
            .appendChild(element);

        setTimeout(() => {
            element.remove();
        }, 3500);
    }


    /* =========================================================
       MODALS
    ========================================================= */

    function openModal(id) {

        document
            .getElementById(id)
            .classList
            .add("open");
    }

    function closeModal(id) {

        document
            .getElementById(id)
            .classList
            .remove("open");
    }


    document.querySelectorAll(
        "[data-close-modal]"
    ).forEach(button => {

        button.addEventListener("click", () => {

            closeModal(
                button.dataset.closeModal
            );

        });

    });


    /* =========================================================
       ACCOUNT SIDEBAR
    ========================================================= */

    function openSidebar() {

        accountSidebar.classList.add("open");
        sidebarOverlay.classList.add("open");
    }

    function closeSidebar() {

        accountSidebar.classList.remove("open");
        sidebarOverlay.classList.remove("open");
    }

    document
        .getElementById("accountButton")
        .addEventListener(
            "click",
            openSidebar
        );

    document
        .getElementById("closeSidebar")
        .addEventListener(
            "click",
            closeSidebar
        );

    sidebarOverlay.addEventListener(
        "click",
        closeSidebar
    );


    /* =========================================================
       SEARCH
    ========================================================= */

    document
        .getElementById("searchButton")
        .addEventListener("click", () => {

            searchWrapper.classList.toggle("active");

            if (
                searchWrapper.classList.contains("active")
            ) {
                navbarSearch.focus();
            }

        });


    navbarSearch.addEventListener(
        "input",
        () => {

            searchTerm =
                navbarSearch.value
                    .trim()
                    .toLowerCase();

            renderLocations();

        }
    );


    /* =========================================================
       FILTERS
    ========================================================= */

    document
        .querySelectorAll(".filter")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".filter")
                        .forEach(item =>
                            item.classList.remove("active")
                        );

                    button.classList.add("active");

                    activeFilter =
                        button.dataset.filter;

                    renderLocations();

                }
            );

        });


    /* =========================================================
       FIRESTORE LOCATIONS
    ========================================================= */

    async function loadLocations() {

        locationsElement.innerHTML = `
            <div class="empty-state">
                Loading locations...
            </div>
        `;

        try {

            const locationsQuery = query(
                collection(db, "locations"),
                orderBy("createdAt", "desc")
            );

            const snapshot =
                await getDocs(locationsQuery);

            allLocations = snapshot.docs.map(
                documentSnapshot => ({
                    id: documentSnapshot.id,
                    ...documentSnapshot.data()
                })
            );

            renderLocations();

        } catch (error) {

            console.error(error);

            /*
                If there are no createdAt fields yet,
                fall back to a normal collection read.
            */

            try {

                const snapshot =
                    await getDocs(
                        collection(db, "locations")
                    );

                allLocations =
                    snapshot.docs.map(
                        documentSnapshot => ({
                            id: documentSnapshot.id,
                            ...documentSnapshot.data()
                        })
                    );

                renderLocations();

            } catch (fallbackError) {

                console.error(fallbackError);

                locationsElement.innerHTML = `
                    <div class="empty-state">
                        Unable to load the location database.
                    </div>
                `;

            }

        }

    }


    /* =========================================================
       FILTER LOCATIONS
    ========================================================= */

    function getFilteredLocations() {

        return allLocations.filter(location => {

            const name =
                String(location.name || "")
                    .toLowerCase();

            const description =
                String(location.description || "")
                    .toLowerCase();

            const tags =
                Array.isArray(location.tags)
                    ? location.tags
                    : [];

            const matchesSearch =
                !searchTerm ||
                name.includes(searchTerm) ||
                description.includes(searchTerm) ||
                tags.some(tag =>
                    tag.toLowerCase()
                        .includes(searchTerm)
                );

            const matchesFilter =
                activeFilter === "all" ||
                tags.includes(activeFilter);

            return (
                matchesSearch &&
                matchesFilter
            );

        });

    }


    /* =========================================================
       MAP MARKERS
    ========================================================= */

    function getLocationMarkerIcon(location) {

    const isSaved =
        currentUser &&
        Array.isArray(currentUserSavedLocations) &&
        currentUserSavedLocations.includes(location.id);

    const isExplored =
        currentUser &&
        Array.isArray(currentUserExploredLocations) &&
        currentUserExploredLocations.some(
            item => item.id === location.id
        );

    // EXPLORED = GREEN
    if (isExplored) {

        return L.divIcon({
            className: "custom-location-marker",

            html: `
                <div class="location-pin explored">
                    <div class="location-pin-dot"></div>
                </div>
            `,

            iconSize: [26, 34],
            iconAnchor: [13, 34],
            popupAnchor: [0, -34]
        });

    }

    // SAVED = RED
    if (isSaved) {

        return L.divIcon({
            className: "custom-location-marker",

            html: `
                <div class="location-pin saved">
                    <div class="location-pin-dot"></div>
                </div>
            `,

            iconSize: [26, 34],
            iconAnchor: [13, 34],
            popupAnchor: [0, -34]
        });

    }

    // DEFAULT = NORMAL LEAFLET MARKER
    return null;
}

    function clearMarkers() {

        markers.forEach(marker => {
            map.removeLayer(marker);
        });

        markers = [];
    }


   function createMarker(location) {

    if (
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number"
    ) {
        return;
    }
    
const markerIcon = getLocationMarkerIcon(location);

const markerOptions = {};

if (markerIcon) {
    markerOptions.icon = markerIcon;
}

const marker = L.marker(
    [
        location.latitude,
        location.longitude
    ],
    markerOptions
).addTo(map);

    const tags =
        Array.isArray(location.tags)
            ? location.tags
            : [];

    const type =
        tags.length
            ? tags[0]
            : "Location";

    /*
        Create a short version of the description
        for the map preview.
    */

    const fullDescription =
        String(
            location.description ||
            "No description provided."
        );

    const shortDescription =
        fullDescription.length > 150
            ? fullDescription.slice(0, 150).trim() + "..."
            : fullDescription;


    /*
        Create the tag pills.
    */

const ratingHtml =
    typeof location.ratingAverage === "number" &&
    typeof location.ratingCount === "number" &&
    location.ratingCount > 0
        ? `
            <button
                type="button"
                class="map-popup-tag map-popup-rating"
                data-rating-location="${escapeHtml(location.id)}"
            >
                ★ ${location.ratingAverage.toFixed(1)}/10
            </button>
        `
        : "";

const tagHtml =
    tags
        .slice(0, 3)
        .map(tag => `
            <span class="map-popup-tag">
                ${escapeHtml(tag)}
            </span>
        `)
        .join("") +
    ratingHtml;


    /*
        Create the popup.
    */

    const popupHtml = `
        <div class="map-popup">

            <div class="map-popup-type">
                ${escapeHtml(type)}
            </div>

            <div class="map-popup-title">
                ${escapeHtml(
                    location.name ||
                    "Unnamed location"
                )}
            </div>

            <div class="map-popup-description">
                ${escapeHtml(shortDescription)}
            </div>

            <div class="map-popup-tags">
                ${tagHtml}
            </div>

<div class="map-popup-actions">

<button
    class="map-popup-more"
    type="button"
    data-location-id="${escapeHtml(location.id)}"
>
    Find Out More
    <span>→</span>
</button>

<button
    class="map-popup-google"
    type="button"
    onclick="window.open(
        'https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}',
        '_blank',
        'noopener,noreferrer'
    )"
>
    Google Maps
    <span>↗</span>
</button>

</div>

        </div>
    `;


    marker.bindPopup(
        popupHtml,
        {
            maxWidth: 320,
            minWidth: 260,
            closeButton: true,
            autoPan: true
        }
    );

// ==========================================
// MAP POPUP HOVER / CLICK BEHAVIOUR
// ==========================================

let popupLocked = false;
let markerHovered = false;
let popupHovered = false;

// ------------------------------------------
// Mouse enters marker
// ------------------------------------------

marker.on("mouseover", () => {

    markerHovered = true;

    // Don't do anything if the popup
    // has been permanently opened by clicking
    if (!popupLocked) {
        marker.openPopup();
    }

});

// ------------------------------------------
// Mouse leaves marker
// ------------------------------------------

marker.on("mouseout", () => {

    markerHovered = false;

    setTimeout(() => {

        if (
            !popupLocked &&
            !markerHovered &&
            !popupHovered
        ) {
            marker.closePopup();
        }

    }, 100);

});

// ------------------------------------------
// Click marker = lock popup open
// ------------------------------------------

marker.on("click", () => {

    popupLocked = true;

    marker.openPopup();

});

// ==========================================
// KEEP POPUP OPEN WHILE MOUSE IS OVER IT
// ==========================================

marker.on("popupopen", () => {

    const popupElement = marker.getPopup().getElement();

    if (!popupElement) {
        return;
    }

    popupElement.addEventListener("mouseenter", () => {

        popupHovered = true;

    });

    popupElement.addEventListener("mouseleave", () => {

        popupHovered = false;

        setTimeout(() => {

            if (
                !popupLocked &&
                !markerHovered &&
                !popupHovered
            ) {
                marker.closePopup();
            }

        }, 100);

    });

});


    markers.push(marker);
}

/* =========================================================
   MAP POPUP → FIND OUT MORE
========================================================= */

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".map-popup-more"
            );

        if (!button) {
            return;
        }


        const locationId =
            button.dataset.locationId;


        if (!locationId) {
            return;
        }

        recordLocationViewed(locationId);


        const card =
            document.querySelector(
                `.location-card[data-location-id="${CSS.escape(locationId)}"]`
            );


        if (!card) {

            console.warn(
                "Location card not found:",
                locationId
            );

            return;
        }


        /*
            Close the Leaflet popup.
        */

        map.closePopup();


        /*
            Scroll to the full database location.
        */

        card.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });


        /*
            Temporarily highlight the location
            so the user knows exactly where they landed.
        */

        card.classList.add(
            "location-card-highlight"
        );


        setTimeout(() => {

            card.classList.remove(
                "location-card-highlight"
            );

        }, 1800);

    }
);


    /* =========================================================
       RENDER LOCATIONS
    ========================================================= */

    function renderLocations() {

        const filtered =
            getFilteredLocations();

        resultCount.textContent =
            `${filtered.length} ${
                filtered.length === 1
                    ? "result"
                    : "results"
            }`;

        clearMarkers();

        filtered.forEach(createMarker);

        if (!filtered.length) {

            locationsElement.innerHTML = `
                <div class="empty-state">
                    No locations match your search or filters.
                </div>
            `;

            return;
        }


        locationsElement.innerHTML =
            filtered.map(location => {

                const tags =
                    Array.isArray(location.tags)
                        ? location.tags
                        : [];

                const type =
                    tags[0] || "Location";

                const tagHtml =
                    tags.map(tag => `
                        <span class="tag">
                            ${escapeHtml(tag)}
                        </span>
                    `).join("");

                    const isSaved =
    currentUser &&
    Array.isArray(currentUserSavedLocations) &&
    currentUserSavedLocations.includes(location.id);

    const exploredEntry =
    currentUser &&
    Array.isArray(currentUserExploredLocations)
        ? currentUserExploredLocations.find(
            item =>
                item.id === location.id
        )
        : null;

const isExplored =
    !!exploredEntry;

    const ratingAverage =
    typeof location.ratingAverage === "number"
        ? location.ratingAverage
        : null;

const ratingCount =
    typeof location.ratingCount === "number"
        ? location.ratingCount
        : 0;

const ratingHtml =
    ratingAverage !== null
        ? `
            <button
                type="button"
                class="location-rating"
                data-rating-location="${escapeHtml(location.id)}"
            >

                <span class="location-rating-star">
                    ★
                </span>

                <span class="location-rating-score">
                    ${ratingAverage.toFixed(1)}
                </span>

                <span class="location-rating-out-of">
                    / 10
                </span>

                <span class="location-rating-count">
                    (${ratingCount})
                </span>

            </button>
        `
        : `
            <div class="location-rating unrated">

                <span class="location-rating-star">
                    ★
                </span>

                <span>
                    Not rated
                </span>

            </div>
        `;

const saveButton =
    currentUser
        ? `
            <button
                type="button"
                class="location-save-button ${isSaved ? "saved" : ""}"
                data-save-location="${escapeHtml(location.id)}"
            >
                ${isSaved ? "Saved" : "Save location"}
                <span>${isSaved ? "✓" : "♡"}</span>
            </button>
        `
        : "";


                const adminActions =
                    currentUser &&
                    currentUser.uid === ADMIN_UID
                        ? `
                            <div class="location-admin-actions">

                                <button
                                    class="button"
                                    type="button"
                                    onclick="window.editExplorerLocation('${location.id}')"
                                >
                                    Edit
                                </button>

                                <button
                                    class="button danger"
                                    type="button"
                                    onclick="window.deleteExplorerLocation('${location.id}')"
                                >
                                    Delete
                                </button>

                            </div>
                        `
                        : "";


                return `
                    <article
                        class="location-card"
                        data-location-id="${location.id}"
                    >

                        <div class="location-type">
                            ${escapeHtml(type)}
                        </div>

                        <h3 class="location-name">
                            ${escapeHtml(
                                location.name ||
                                "Unnamed location"
                            )}
                        </h3>

                        <p class="location-description">
                            ${escapeHtml(
                                location.description ||
                                "No description provided."
                            )}
                        </p>

<div class="location-meta-row">

    <div class="tags">
        ${tagHtml}

        ${ratingHtml}
    </div>

</div>

<div class="location-card-actions">

    ${saveButton}

${currentUser ? `
    <button
        type="button"
        class="location-explored-button ${
            isExplored ? "explored" : ""
        }"
        data-explore-location="${escapeHtml(location.id)}"
    >
        ${
            isExplored
                ? "Explored ✓"
                : "Mark as explored"
        }
    </button>
` : ""}
<a
    class="location-google-maps-button"
    href="https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}"
    target="_blank"
    rel="noopener noreferrer"
>
    Open in Google Maps
    <span>↗</span>
</a>

</div>

${adminActions}

                    </article>
                `;

            }).join("");

    }

    // ==========================================
// CLICKING ELSEWHERE UNLOCKS POPUP
// ==========================================

map.on("click", () => {

    markers.forEach(marker => {

        const popup = marker.getPopup();

        if (popup && popup.isOpen()) {

            // Only unlock/close if the click
            // wasn't on the marker itself
            popup._source._popupLocked = false;

        }

    });

});


    /* =========================================================
       ESCAPE HTML
    ========================================================= */

    function escapeHtml(value) {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }

  /* =========================================================
   USER EXPLORE DATA
========================================================= */

async function loadUserExploreData() {

    if (!currentUser) {

        currentUserSavedLocations = [];
        currentUserViewedLocations = [];
        currentUserExploredLocations = [];

        updateUserStats();

        return;
    }

    try {

        const userRef =
            doc(
                db,
                "users",
                currentUser.uid
            );

        const snapshot =
            await getDoc(userRef);

        if (!snapshot.exists()) {

            currentUserSavedLocations = [];
            currentUserViewedLocations = [];
            currentUserExploredLocations = [];

            updateUserStats();

            return;
        }

        const data =
            snapshot.data();


        /*
            Saved locations
        */

        currentUserSavedLocations =
            Array.isArray(data.savedLocations)
                ? data.savedLocations
                : [];


        /*
            Recently viewed locations

            Supports both the NEW format:

            {
                id,
                viewedAt
            }

            and your OLD format:

            "locationID"
        */

        currentUserViewedLocations =
            Array.isArray(data.viewedLocations)
                ? data.viewedLocations.map(item => {

                    if (typeof item === "string") {

                        return {
                            id: item,
                            viewedAt: null
                        };

                    }

                    return item;

                })
                : [];


        /*
            Explored locations

            Each item:

            {
                id,
                exploredAt,
                rating
            }
        */

        currentUserExploredLocations =
            Array.isArray(data.exploredLocations)
                ? data.exploredLocations
                : [];


        updateUserStats(data);
updateAccountUI();

    } catch (error) {

        console.error(
            "Unable to load explore data:",
            error
        );

        currentUserSavedLocations = [];
        currentUserViewedLocations = [];
        currentUserExploredLocations = [];

        updateUserStats();

    }

}

/* =========================================================
   USER STATS
========================================================= */

function updateUserStats(userData = null) {

    const exploreSince =
        document.getElementById("exploreSince");

    const locationsViewedCount =
        document.getElementById("locationsViewedCount");

    const locationsSavedCount =
        document.getElementById("locationsSavedCount");

    const locationsExploredCount =
        document.getElementById("locationsExploredCount");

    const exploreProgress =
        document.getElementById("exploreProgress");

    const exploreProgressText =
        document.getElementById("exploreProgressText");


    if (!currentUser) {

        if (exploreSince)
            exploreSince.textContent = "—";

        if (locationsViewedCount)
            locationsViewedCount.textContent = "0";

        if (locationsSavedCount)
            locationsSavedCount.textContent = "0";

        if (locationsExploredCount)
            locationsExploredCount.textContent = "0";

        if (exploreProgress)
            exploreProgress.style.width = "0%";

        if (exploreProgressText)
            exploreProgressText.textContent = "0% explored";

        return;
    }


    /*
        Saved
    */

    const savedCount =
        Array.isArray(currentUserSavedLocations)
            ? currentUserSavedLocations.length
            : 0;


    /*
        Explored
    */

    const exploredCount =
        Array.isArray(currentUserExploredLocations)
            ? currentUserExploredLocations.length
            : 0;


    /*
        Recently viewed
    */

    const viewedCount =
        Array.isArray(currentUserViewedLocations)
            ? currentUserViewedLocations.length
            : 0;


    if (locationsSavedCount)
        locationsSavedCount.textContent =
            savedCount;


    if (locationsViewedCount)
        locationsViewedCount.textContent =
            viewedCount;


    if (locationsExploredCount)
        locationsExploredCount.textContent =
            exploredCount;


    /*
        Explore since
    */

    let createdAt =
        userData?.createdAt;


    if (
        createdAt &&
        typeof createdAt.toDate === "function"
    ) {

        createdAt =
            createdAt.toDate();

    }


    if (createdAt instanceof Date) {

        if (exploreSince) {

            exploreSince.textContent =
                createdAt.toLocaleDateString(
                    "en-GB",
                    {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                    }
                );

        }

    } else {

        if (exploreSince)
            exploreSince.textContent = "—";

    }


    /*
        Exploration percentage
    */

    const totalLocations =
        allLocations.length;


    let percentage = 0;


    if (totalLocations > 0) {

        percentage =
            Math.round(
                (exploredCount / totalLocations) * 100
            );

    }


    /*
        Never allow percentage
        to exceed 100%.
    */

    percentage =
        Math.min(
            100,
            Math.max(0, percentage)
        );


    if (exploreProgress) {

        exploreProgress.style.width =
            `${percentage}%`;

    }


    if (exploreProgressText) {

        exploreProgressText.textContent =
            `${percentage}% explored`;

    }

}

/* =========================================================
   RATING MODAL
========================================================= */

let ratingLocationId = null;


/*
    Open rating modal
*/

function openRatingModal(locationId) {

    if (!currentUser) {
        return;
    }

    ratingLocationId = locationId;

    const ratingButtons =
        document.getElementById(
            "ratingButtons"
        );

    const ratingMessage =
        document.getElementById(
            "ratingMessage"
        );

    ratingButtons.innerHTML = "";

    ratingMessage.textContent = "";

    for (let rating = 1; rating <= 10; rating++) {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "rating-button";

        button.dataset.rating =
            rating;

        button.textContent =
            rating;

        button.addEventListener(
            "click",
            () => saveLocationRating(
                locationId,
                rating
            )
        );

        ratingButtons.appendChild(
            button
        );

    }

    openModal("ratingModal");

}


/*
    Save rating
*/

async function saveLocationRating(
    locationId,
    rating
) {

    if (!currentUser) {
        return;
    }

    try {

        const userRef =
            doc(
                db,
                "users",
                currentUser.uid
            );

        const userSnapshot =
            await getDoc(userRef);

        const userData =
            userSnapshot.exists()
                ? userSnapshot.data()
                : {};

        let explored =
            Array.isArray(
                userData.exploredLocations
            )
                ? [...userData.exploredLocations]
                : [];


        /*
            Find the explored location
        */

        const exploredIndex =
            explored.findIndex(
                item =>
                    item.id === locationId
            );


        if (exploredIndex === -1) {

            toast(
                "Unable to find your explored location."
            );

            return;

        }


        /*
            Add the rating to the user's
            explored location record.
        */
const oldRating =
    typeof explored[exploredIndex].rating === "number"
        ? explored[exploredIndex].rating
        : null;


explored[exploredIndex] = {

    ...explored[exploredIndex],

    rating: rating,

    previousRating: oldRating

};


        /*
            Save user's rating
        */

        await setDoc(
            userRef,
            {
                exploredLocations:
                    explored
            },
            {
                merge: true
            }
        );

        // ==========================================
// SAVE PUBLIC RATING RECORD
// ==========================================

const username =
    currentUsername ||
    userData.username ||
    "Anonymous";

const ratingQuery = query(
    collection(db, "explorations"),
    where("userId", "==", currentUser.uid),
    where("locationId", "==", locationId)
);

const ratingSnapshot =
    await getDocs(ratingQuery);

if (!ratingSnapshot.empty) {

    const ratingDoc =
        ratingSnapshot.docs[0];

    await updateDoc(
        ratingDoc.ref,
        {
            username: username,
            rating: rating
        }
    );

} else {

    await addDoc(
        collection(db, "explorations"),
        {
            userId: currentUser.uid,
            username: username,
            locationId: locationId,
            rating: rating,
            createdAt: serverTimestamp()
        }
    );
}


        /*
            Update local data
        */

        currentUserExploredLocations =
            explored;


        /*
            Update the public location rating
        */

        await updateLocationRating(
            locationId,
            rating,
            oldRating
        );


        closeModal(
            "ratingModal"
        );


        renderLocations();

        toast(
            `Rated ${rating}/10.`
        );


    } catch (error) {

        console.error(
            "Unable to save rating:",
            error
        );

        document.getElementById(
            "ratingMessage"
        ).textContent =
            "Unable to save your rating.";

    }

}


/*
    Skip rating
*/

document
    .getElementById("skipRatingButton")
    .addEventListener(
        "click",
        () => {

            ratingLocationId = null;

            closeModal(
                "ratingModal"
            );

        }
    );

    // ==========================================
// SHOW LOCATION RATINGS
// ==========================================

async function showLocationRatings(locationId) {

    if (!currentUser) {
        toast("Sign in to view ratings.");
        return;
    }

    const location =
        allLocations.find(
            item => item.id === locationId
        );

    if (!location) {
        return;
    }

    const title =
        document.getElementById(
            "ratingListTitle"
        );

    const content =
        document.getElementById(
            "ratingListContent"
        );

    title.textContent =
        location.name || "Location ratings";

    content.innerHTML = `
        <div class="empty-state">
            Loading ratings...
        </div>
    `;

    openModal("ratingListModal");

    try {

        const ratingsQuery = query(
            collection(db, "explorations"),
            where(
                "locationId",
                "==",
                locationId
            )
        );

        const snapshot =
            await getDocs(ratingsQuery);

        const ratings = snapshot.docs
            .map(documentSnapshot => ({
                id: documentSnapshot.id,
                ...documentSnapshot.data()
            }))
            .filter(
                item =>
                    typeof item.rating === "number"
            );

if (!ratings.length) {

    document.getElementById(
        "ratingOverallScore"
    ).textContent = "—";

    document.getElementById(
        "ratingOverallCount"
    ).textContent = "Based on 0 ratings";


    content.innerHTML = `
        <div class="explore-empty">

            <div class="explore-empty-title">
                No ratings yet
            </div>

            <div class="explore-empty-text">
                Nobody has rated this location yet.
            </div>

        </div>
    `;

    return;
}


/* ==========================================
   CALCULATE OVERALL RATING
========================================== */

const totalRating =
    ratings.reduce(
        (total, item) =>
            total + item.rating,
        0
    );

const averageRating =
    totalRating / ratings.length;


document.getElementById(
    "ratingOverallScore"
).textContent =
    averageRating.toFixed(1);


document.getElementById(
    "ratingOverallCount"
).textContent =
    `Based on ${ratings.length} rating${
        ratings.length === 1 ? "" : "s"
    }`;

        ratings.sort(
            (a, b) =>
                b.rating - a.rating
        );

        content.innerHTML =
            ratings.map(rating => {

                const username =
                    escapeHtml(
                        rating.username ||
                        "Anonymous"
                    );

return `
    <div class="rating-user-row">

        <div class="rating-user-info">

            <div class="rating-user-label">
                Username
            </div>

            <div class="rating-user-name">
                ${username}
            </div>

        </div>

        <div class="rating-user-score">

            <div class="rating-user-label">
                Rating given
            </div>

            <div class="rating-user-rating">
                ★ ${rating.rating}/10
            </div>

        </div>

    </div>
`;

            }).join("");

    } catch (error) {

        console.error(
            "Unable to load ratings:",
            error
        );

        content.innerHTML = `
            <div class="empty-state">
                Unable to load ratings.
            </div>
        `;
    }
}

// ==========================================
// RATING TAG CLICK
// ==========================================

document.addEventListener(
    "click",
    event => {

        const ratingButton =
            event.target.closest(
                "[data-rating-location]"
            );

        if (!ratingButton) {
            return;
        }

        const locationId =
            ratingButton.dataset.ratingLocation;

        if (!locationId) {
            return;
        }

        showLocationRatings(
            locationId
        );

    }
);

  /* =========================================================
   UPDATE LOCATION RATING
========================================================= */

async function updateLocationRating(
    locationId,
    newRating,
    oldRating = null
) {

    const locationRef =
        doc(
            db,
            "locations",
            locationId
        );

    const locationSnapshot =
        await getDoc(locationRef);


    if (!locationSnapshot.exists()) {

        throw new Error(
            "Location does not exist."
        );

    }


    const locationData =
        locationSnapshot.data();


    const currentAverage =
        typeof locationData.ratingAverage === "number"
            ? locationData.ratingAverage
            : 0;


    const currentCount =
        typeof locationData.ratingCount === "number"
            ? locationData.ratingCount
            : 0;


    let newAverage;
    let newCount;


    /*
        Existing rating:
        replace it.
    */

    if (
        typeof oldRating === "number" &&
        currentCount > 0
    ) {

        const total =
            currentAverage *
            currentCount;

        newAverage =
            (
                total -
                oldRating +
                newRating
            ) /
            currentCount;

        newCount =
            currentCount;

    }


    /*
        First rating:
        add it.
    */

    else {

        const total =
            currentAverage *
            currentCount;

        newCount =
            currentCount + 1;

        newAverage =
            (
                total +
                newRating
            ) /
            newCount;

    }


    newAverage =
        Math.round(
            newAverage * 10
        ) / 10;


    await setDoc(
        locationRef,
        {
            ratingAverage:
                newAverage,

            ratingCount:
                newCount
        },
        {
            merge: true
        }
    );


    /*
        Update local copy
    */

    const localLocation =
        allLocations.find(
            location =>
                location.id === locationId
        );


    if (localLocation) {

        localLocation.ratingAverage =
            newAverage;

        localLocation.ratingCount =
            newCount;

    }

}

/* =========================================================
   SAVE / UNSAVE LOCATION
========================================================= */

async function toggleSavedLocation(locationId) {

    if (!currentUser) {

        toast("Sign in to save locations.");

        return;

    }

    try {

        const userRef =
            doc(
                db,
                "users",
                currentUser.uid
            );

        const snapshot =
            await getDoc(userRef);

        let saved =
            snapshot.exists() &&
            Array.isArray(snapshot.data().savedLocations)
                ? [...snapshot.data().savedLocations]
                : [];

        const index =
            saved.indexOf(locationId);

        if (index === -1) {

            saved.push(locationId);

            toast("Location saved.");

        } else {

            saved.splice(index, 1);

            toast("Location removed from saved.");

        }

        await setDoc(
            userRef,
            {
                savedLocations: saved
            },
            {
                merge: true
            }
        );

        currentUserSavedLocations = saved;

        updateUserStats();

        renderLocations();

        if (
            document
                .getElementById("exploreLocationsView")
                .style.display !== "none"
        ) {

            renderExploreLocations();

        }

    } catch (error) {

        console.error(error);

        toast(
            "Unable to save this location."
        );

    }

}

/* =========================================================
   MARK LOCATION AS EXPLORED
========================================================= */

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-explore-location]"
            );

        if (!button) {
            return;
        }


        const locationId =
            button.dataset.exploreLocation;


        if (!locationId) {
            return;
        }


        toggleExploredLocation(
            locationId
        );

    }
);

/* =========================================================
   TOGGLE EXPLORED
========================================================= */

async function toggleExploredLocation(locationId) {

    if (!currentUser) {

        toast(
            "Sign in to mark locations as explored."
        );

        return;

    }


    try {

        let explored =
            Array.isArray(
                currentUserExploredLocations
            )
                ? [...currentUserExploredLocations]
                : [];


        const existingIndex =
            explored.findIndex(
                item =>
                    item.id === locationId
            );


        /*
            ==========================================
            UNEXPLORE
            ==========================================
        */

        if (existingIndex !== -1) {

            const existingEntry =
                explored[existingIndex];


            /*
                Get the user's existing rating.

                If they rated the location, we need
                to remove that rating from the
                public location statistics.
            */

            const oldRating =
                typeof existingEntry.rating === "number"
                    ? existingEntry.rating
                    : null;


            /*
                Remove the explored location
                from the user's profile.
            */

            explored.splice(
                existingIndex,
                1
            );


            /*
                Save the updated explored list.
            */

            await setDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                ),
                {
                    exploredLocations:
                        explored
                },
                {
                    merge: true
                }
            );


            /*
                Update local state.
            */

            currentUserExploredLocations =
                explored;


            /*
                Remove the user's rating from
                the public location rating.
            */

            if (typeof oldRating === "number") {

                await removeLocationRating(
                    locationId,
                    oldRating
                );

            }


            /*
                Update the page.
            */

            updateUserStats();

            renderLocations();


            toast(
                "Location unexplored and review removed."
            );


            return;

        }


        /*
            ==========================================
            EXPLORE
            ==========================================
        */


        explored.push({

            id: locationId,

            exploredAt:
                new Date(),

            rating:
                null,

            previousRating:
                null

        });


        /*
            Update local state.
        */

        currentUserExploredLocations =
            explored;


        /*
            Save to Firestore.
        */

        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            {
                exploredLocations:
                    explored
            },
            {
                merge: true
            }
        );


        updateUserStats();

        renderLocations();


        toast(
            "Location marked as explored."
        );


        /*
            Open rating prompt.
        */

        openRatingModal(
            locationId
        );


    } catch (error) {

        console.error(
            "Unable to update explored location:",
            error
        );


        toast(
            "Unable to update this location."
        );

    }

}

document.addEventListener("click", event => {

    const button =
        event.target.closest(
            "[data-save-location]"
        );

    if (!button) {
        return;
    }

    const locationId =
        button.dataset.saveLocation;

    if (!locationId) {
        return;
    }

    toggleSavedLocation(locationId);

});

/* =========================================================
   REMOVE LOCATION RATING
========================================================= */

async function removeLocationRating(
    locationId,
    ratingToRemove
) {

    const locationRef =
        doc(
            db,
            "locations",
            locationId
        );


    const locationSnapshot =
        await getDoc(locationRef);


    if (!locationSnapshot.exists()) {

        throw new Error(
            "Location does not exist."
        );

    }


    const locationData =
        locationSnapshot.data();


    const currentAverage =
        typeof locationData.ratingAverage === "number"
            ? locationData.ratingAverage
            : 0;


    const currentCount =
        typeof locationData.ratingCount === "number"
            ? locationData.ratingCount
            : 0;


    /*
        If this was the last rating,
        remove the rating statistics entirely.
    */

    if (currentCount <= 1) {

        await updateDoc(
            locationRef,
            {
                ratingAverage: 0,
                ratingCount: 0
            }
        );


        const localLocation =
            allLocations.find(
                location =>
                    location.id === locationId
            );


        if (localLocation) {

            localLocation.ratingAverage = 0;

            localLocation.ratingCount = 0;

        }


        return;

    }


    /*
        Calculate the old total.
    */

    const oldTotal =
        currentAverage *
        currentCount;


    /*
        Remove this user's rating.
    */

    const newTotal =
        oldTotal -
        ratingToRemove;


    const newCount =
        currentCount -
        1;


    const newAverage =
        Math.round(
            (
                newTotal /
                newCount
            ) * 10
        ) / 10;


    /*
        Save the new public rating.
    */

    await updateDoc(
        locationRef,
        {
            ratingAverage:
                newAverage,

            ratingCount:
                newCount
        }
    );


    /*
        Update local location data.
    */

    const localLocation =
        allLocations.find(
            location =>
                location.id === locationId
        );


    if (localLocation) {

        localLocation.ratingAverage =
            newAverage;

        localLocation.ratingCount =
            newCount;

    }

}

/* =========================================================
   RECORD RECENTLY VIEWED LOCATION
========================================================= */

async function recordLocationViewed(locationId) {

    if (!currentUser) {
        return;
    }


    try {

        let viewed =
            Array.isArray(
                currentUserViewedLocations
            )
                ? [...currentUserViewedLocations]
                : [];


        /*
            Remove existing entry.

            This allows the location to move
            back to the top when viewed again.
        */

        viewed =
            viewed.filter(item => {

                const id =
                    typeof item === "string"
                        ? item
                        : item.id;

                return id !== locationId;

            });


        /*
            Add newest view to the beginning.
        */

        viewed.unshift({

            id: locationId,

            viewedAt: new Date()

        });


        /*
            Keep only the latest 10.
        */

        viewed =
            viewed.slice(0, 10);


        currentUserViewedLocations =
            viewed;


        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            {
                viewedLocations: viewed
            },
            {
                merge: true
            }
        );


        updateUserStats();

    } catch (error) {

        console.error(
            "Unable to record viewed location:",
            error
        );

    }

}

/* =========================================================
   EXPLORE SIDEBAR
========================================================= */

const exploreLocationsView =
    document.getElementById(
        "exploreLocationsView"
    );

const exploreLocationList =
    document.getElementById(
        "exploreLocationList"
    );

const exploreViewTitle =
    document.getElementById(
        "exploreViewTitle"
    );

const exploreLocationSearch =
    document.getElementById(
        "exploreLocationSearch"
    );


function openExploreView(mode) {

    if (!currentUser) {

        toast("Sign in to use this feature.");

        return;

    }

    exploreViewMode = mode;

    exploreSearchTerm = "";

    exploreLocationSearch.value = "";


    /* ==========================================
       HIDE NORMAL ACCOUNT CONTENT
    ========================================== */

    document.getElementById(
        "loggedInAccount"
    ).style.display = "none";


    /* ==========================================
       SHOW EXPLORE CONTENT
    ========================================== */

    exploreLocationsView.style.display =
        "block";


    /* ==========================================
       CHANGE TITLE
    ========================================== */

if (mode === "saved") {

    exploreViewTitle.textContent =
        "Saved locations";

} else if (mode === "viewed") {

    exploreViewTitle.textContent =
        "Recently viewed";

} else {

    exploreViewTitle.textContent =
        "Locations explored";

}


    /* ==========================================
       RENDER LOCATIONS
    ========================================== */

    renderExploreLocations();

}


function closeExploreView() {

    /* ==========================================
       HIDE EXPLORE SCREEN
    ========================================== */

    exploreLocationsView.style.display =
        "none";


    /* ==========================================
       SHOW NORMAL ACCOUNT SCREEN
    ========================================== */

    document.getElementById(
        "loggedInAccount"
    ).style.display =
        "block";

}


document
    .getElementById("savedLocationsButton")
    .addEventListener(
        "click",
        () => openExploreView("saved")
    );


document
    .getElementById("viewedLocationsButton")
    .addEventListener(
        "click",
        () => openExploreView("viewed")
    );

    document
    .getElementById("exploredLocationsButton")
    .addEventListener(
        "click",
        () => openExploreView("explored")
    );


document
    .getElementById("exploreBackButton")
    .addEventListener(
        "click",
        closeExploreView
    );


document
    .getElementById("exploreCloseButton")
    .addEventListener(
        "click",
        closeSidebar
    );


exploreLocationSearch.addEventListener(
    "input",
    () => {

        exploreSearchTerm =
            exploreLocationSearch.value
                .trim()
                .toLowerCase();

        renderExploreLocations();

    }
);

function renderExploreLocations() {

    if (!currentUser) {

        exploreLocationList.innerHTML = `
            <div class="empty-state">
                Sign in to use Explore.
            </div>
        `;

        return;

    }

let locations = [];

if (exploreViewMode === "saved") {

    locations =
        currentUserSavedLocations
            .map(id =>
                allLocations.find(
                    location =>
                        location.id === id
                )
            )
            .filter(Boolean);

} else if (exploreViewMode === "viewed") {

    locations =
        currentUserViewedLocations
            .map(item => {

                const id =
                    typeof item === "string"
                        ? item
                        : item.id;

                return allLocations.find(
                    location =>
                        location.id === id
                );

            })
            .filter(Boolean);

} else if (exploreViewMode === "explored") {

    locations =
        currentUserExploredLocations
            .map(item =>
                allLocations.find(
                    location =>
                        location.id === item.id
                )
            )
            .filter(Boolean);

}


    if (exploreSearchTerm) {

        locations =
            locations.filter(location => {

                const name =
                    String(
                        location.name || ""
                    ).toLowerCase();

                const description =
                    String(
                        location.description || ""
                    ).toLowerCase();

                const tags =
                    Array.isArray(location.tags)
                        ? location.tags
                        : [];

                return (
                    name.includes(
                        exploreSearchTerm
                    ) ||

                    description.includes(
                        exploreSearchTerm
                    ) ||

                    tags.some(tag =>
                        tag
                            .toLowerCase()
                            .includes(
                                exploreSearchTerm
                            )
                    )
                );

            });

    }


    if (!locations.length) {

        exploreLocationList.innerHTML = `
            <div class="explore-empty">

                <div class="explore-empty-icon">
                    ${exploreViewMode === "saved" ? "♡" : "◷"}
                </div>

<div class="explore-empty-title">

    ${
        exploreViewMode === "saved"
            ? "No saved locations"
            : exploreViewMode === "viewed"
                ? "No locations viewed"
                : "No locations explored"
    }

</div>

<div class="explore-empty-text">

    ${
        exploreViewMode === "saved"
            ? "Locations you save will appear here."
            : exploreViewMode === "viewed"
                ? "Locations you view will appear here."
                : "Locations you mark as explored will appear here."
    }

</div>

            </div>
        `;

        return;

    }


    exploreLocationList.innerHTML =
        locations.map(location => {

            const tags =
                Array.isArray(location.tags)
                    ? location.tags
                    : [];

            const type =
                tags[0] || "Location";


            return `
<button 
    type="button" 
    class="explore-location-item" 
    data-explore-view-location="${escapeHtml(location.id)}" 
>

                    <div class="explore-location-type">
                        ${escapeHtml(type)}
                    </div>

                    <div class="explore-location-name">
                        ${escapeHtml(
                            location.name ||
                            "Unnamed location"
                        )}
                    </div>

                    <div class="explore-location-description">
                        ${escapeHtml(
                            String(
                                location.description ||
                                "No description provided."
                            ).slice(0, 100)
                        )}
                        ${
                            String(
                                location.description || ""
                            ).length > 100
                                ? "..."
                                : ""
                        }
                    </div>

                    <div class="explore-location-arrow">
                        →
                    </div>

                </button>
            `;

        }).join("");

}

document.addEventListener(
    "click",
    event => {

        const item =
            event.target.closest(
                "[data-explore-view-location]"
            );

        if (!item) {
            return;
        }

        const locationId =
            item.dataset.exploreViewLocation;

        const location =
            allLocations.find(
                item =>
                    item.id === locationId
            );

        if (!location) {

            toast(
                "This location is no longer available."
            );

            return;
        }

        closeExploreView();
        closeSidebar();

        const card =
            document.querySelector(
                `.location-card[data-location-id="${CSS.escape(locationId)}"]`
            );

        if (card) {

            card.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            card.classList.add(
                "location-card-highlight"
            );

            setTimeout(() => {

                card.classList.remove(
                    "location-card-highlight"
                );

            }, 1800);

        }

        if (
            typeof location.latitude === "number" &&
            typeof location.longitude === "number"
        ) {

            map.setView(
                [
                    location.latitude,
                    location.longitude
                ],
                Math.max(
                    map.getZoom(),
                    13
                )
            );

        }

    }
);


    /* =========================================================
       AUTH UI
    ========================================================= */

    let authMode = "signin";

    function setAuthMode(mode) {

        authMode = mode;

        const signInTab =
            document.getElementById("signInTab");

        const registerTab =
            document.getElementById("registerTab");

        const usernameGroup =
            document.getElementById("usernameGroup");

        const submit =
            document.getElementById("authSubmit");

            const forgotPasswordButton =
    document.getElementById("forgotPasswordButton");

        signInTab.classList.toggle(
            "active",
            mode === "signin"
        );

        registerTab.classList.toggle(
            "active",
            mode === "register"
        );

        usernameGroup.style.display =
            mode === "register"
                ? "block"
                : "none";

                forgotPasswordButton.style.display =
    mode === "signin"
        ? "block"
        : "none";

        submit.textContent =
            mode === "register"
                ? "Create account"
                : "Sign in";

        document.getElementById(
            "authMessage"
        ).textContent = "";

    }


    document
        .getElementById("signInTab")
        .addEventListener(
            "click",
            () => setAuthMode("signin")
        );

    document
        .getElementById("registerTab")
        .addEventListener(
            "click",
            () => setAuthMode("register")
        );


    document
        .getElementById("openAuthButton")
        .addEventListener(
            "click",
            () => {

                closeSidebar();

                setAuthMode("signin");

                openModal("authModal");

            }
        );


    /* =========================================================
       REGISTER / LOGIN
    ========================================================= */

    document
        .getElementById("authForm")
        .addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const email =
                    document.getElementById(
                        "authEmail"
                    ).value.trim();

                const password =
                    document.getElementById(
                        "authPassword"
                    ).value;

                const username =
                    document.getElementById(
                        "authUsername"
                    ).value.trim();

                const message =
                    document.getElementById(
                        "authMessage"
                    );

                message.className =
                    "auth-message";

                message.textContent =
                    "Please wait...";

                try {

                    if (authMode === "register") {

                        if (
                            username.length < 2
                        ) {
                            throw new Error(
                                "Username must be at least 2 characters."
                            );
                        }

                        if (
                            !/^[a-zA-Z0-9_.-]+$/.test(username)
                        ) {
                            throw new Error(
                                "Username can only contain letters, numbers, dots, underscores and hyphens."
                            );
                        }

                        const usernameKey =
                            username.toLowerCase();

                        const usernameRef =
                            doc(
                                db,
                                "usernames",
                                usernameKey
                            );

                        const existingUsername =
                            await getDoc(usernameRef);

                        if (
                            existingUsername.exists()
                        ) {
                            throw new Error(
                                "That username is already taken."
                            );
                        }

                        const credential =
                            await createUserWithEmailAndPassword(
                                auth,
                                email,
                                password
                            );

                        await setDoc(
                            usernameRef,
                            {
                                uid:
                                    credential.user.uid,
                                username
                            }
                        );

                        await setDoc(
                            doc(
                                db,
                                "users",
                                credential.user.uid
                            ),
                            {
                                username,
                                email,
                                createdAt:
                                    serverTimestamp()
                            }
                        );

                        message.className =
                            "auth-message success";

                        message.textContent =
                            "Account created.";

                        closeModal("authModal");

                    } else {

                        await signInWithEmailAndPassword(
                            auth,
                            email,
                            password
                        );

                        closeModal("authModal");

                    }

                } catch (error) {

                    console.error(error);

                    message.className =
                        "auth-message error";

                    message.textContent =
                        friendlyAuthError(error);

                }

            }
        );


    function friendlyAuthError(error) {

        const code =
            error?.code || "";

        if (
            code ===
            "auth/email-already-in-use"
        ) {
            return "That email address is already registered.";
        }

        if (
            code ===
            "auth/invalid-email"
        ) {
            return "Please enter a valid email address.";
        }

        if (
            code ===
            "auth/weak-password"
        ) {
            return "Your password is too weak.";
        }

        if (
            code ===
            "auth/invalid-credential" ||
            code ===
            "auth/wrong-password" ||
            code ===
            "auth/user-not-found"
        ) {
            return "Incorrect email or password.";
        }

        if (
            error?.message
        ) {
            return error.message;
        }

        return "Something went wrong.";

    }

    /* =========================================================
   ACCOUNT UI VISIBILITY
========================================================= */

function updateAccountUI() {

    const loggedOutAccount =
        document.getElementById("loggedOutAccount");

    const loggedInAccount =
        document.getElementById("loggedInAccount");

    const adminSection =
        document.getElementById("adminSection");

    if (!currentUser) {

        if (loggedOutAccount) {
            loggedOutAccount.style.display = "block";
        }

        if (loggedInAccount) {
            loggedInAccount.style.display = "none";
        }

        if (adminSection) {
            adminSection.style.display = "none";
        }

        return;
    }

    /*
        User is logged in.
        Always force the logged-in account
        section to be visible.
    */

    if (loggedOutAccount) {
        loggedOutAccount.style.display = "none";
    }

    if (loggedInAccount) {
        loggedInAccount.style.display = "block";
        loggedInAccount.hidden = false;
    }

    /*
        Admin section
    */

    if (adminSection) {

        adminSection.style.display =
            currentUser.uid === ADMIN_UID
                ? "block"
                : "none";

    }

}

    /* =========================================================
       AUTH STATE
    ========================================================= */

    onAuthStateChanged(
    auth,
    async user => {

        currentUser = user;

        /*
            Immediately update the account UI.
            This prevents the logged-in section
            from staying hidden while Firestore loads.
        */

        updateAccountUI();

        if (user) {

            await loadUserExploreData();

        } else {

            currentUserSavedLocations = [];
            currentUserViewedLocations = [];
            currentUserExploredLocations = [];

            updateUserStats();

        }


            if (!user) {

                currentUsername = "";

                document.getElementById(
                    "loggedOutAccount"
                ).style.display = "block";

                document.getElementById(
                    "loggedInAccount"
                ).style.display = "none";

                document.getElementById(
                    "accountAvatar"
                ).textContent = "?";

                document.getElementById(
                    "accountButtonText"
                ).textContent = "Account";

                document.getElementById(
                    "adminSection"
                ).style.display = "none";

                renderLocations();

                return;
            }


            try {

                const userSnapshot =
                    await getDoc(
                        doc(
                            db,
                            "users",
                            user.uid
                        )
                    );

if (userSnapshot.exists()) {

    const userData =
        userSnapshot.data();

    currentUsername =
        userData.username ||
        user.email?.split("@")[0] ||
        "User";

    updateUserStats(userData);

} else {

    // The Firebase Authentication account exists,
    // but the Firestore profile does not.
    //
    // Create it automatically.

    currentUsername =
        user.email?.split("@")[0] ||
        "User";

    try {

        await setDoc(
            doc(
                db,
                "users",
                user.uid
            ),
            {
                username: currentUsername,
                email: user.email || "",
                createdAt: serverTimestamp()
            }
        );

    } catch (profileError) {

        console.error(
            "Unable to create user profile:",
            profileError
        );

    }
}

            } catch {

                currentUsername =
                    user.email?.split("@")[0] ||
                    "User";

            }


            const initials =
                getInitials(currentUsername);


            document.getElementById(
                "accountAvatar"
            ).textContent = initials;

            document.getElementById(
                "accountButtonText"
            ).textContent =
                currentUsername;


            document.getElementById(
                "sidebarAvatar"
            ).textContent =
                initials;

            document.getElementById(
                "sidebarUsername"
            ).textContent =
                currentUsername;

            document.getElementById(
                "sidebarEmail"
            ).textContent =
                user.email || "";


           updateAccountUI();


            if (
                user.uid === ADMIN_UID
            ) {

                document.getElementById(
                    "adminSection"
                ).style.display = "block";

            } else {

                document.getElementById(
                    "adminSection"
                ).style.display = "none";

            }


            renderLocations();

        }
    );


    function getInitials(username) {

        return username
            .trim()
            .slice(0, 2)
            .toUpperCase();

    }

    /* =========================================================
   LOCATION CARD CLICK
========================================================= */

document.addEventListener("click", event => {

    const card =
        event.target.closest(".location-card");

    if (!card) {
        return;
    }

    /*
        Don't treat buttons such as Save/Edit/Delete
        as opening the location.
    */

    if (
        event.target.closest("button")
    ) {
        return;
    }

    const locationId =
        card.dataset.locationId;

    if (!locationId) {
        return;
    }

    recordLocationViewed(locationId);

});

    /* =========================================================
       SIGN OUT
    ========================================================= */

    document
        .getElementById("signOutButton")
        .addEventListener(
            "click",
            async () => {

                await signOut(auth);

                closeSidebar();

                toast("Signed out.");

            }
        );


    /* =========================================================
       RESET PASSWORD
    ========================================================= */

    document
        .getElementById("resetPasswordButton")
        .addEventListener(
            "click",
            async () => {

                if (!currentUser?.email) {
                    return;
                }

                try {

                    await sendPasswordResetEmail(
                        auth,
                        currentUser.email
                    );

                    toast(
                        "Password reset email sent."
                    );

                } catch (error) {

                    toast(
                        friendlyAuthError(error)
                    );

                }

            }
        );

            /* =========================================================
       Forgot PASS Sign in
    ========================================================= */
    
document
    .getElementById("forgotPasswordButton")
    .addEventListener(
        "click",
        async () => {

            const emailInput =
                document.getElementById("authEmail");

            const email =
                emailInput.value.trim();

            const message =
                document.getElementById("authMessage");


            if (!email) {

                message.className =
                    "auth-message error";

                message.textContent =
                    "Enter your email address first.";

                emailInput.focus();

                return;
            }


            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );

                message.className =
                    "auth-message success";

                message.textContent =
                    "Password reset email sent.";

            } catch (error) {

                console.error(error);

                message.className =
                    "auth-message error";

                message.textContent =
                    friendlyAuthError(error);

            }

        }
    );
    /* =========================================================
       CHANGE USERNAME
    ========================================================= */

    document
        .getElementById("changeUsernameButton")
        .addEventListener(
            "click",
            () => {

                document.getElementById(
                    "newUsername"
                ).value =
                    currentUsername;

                document.getElementById(
                    "usernameMessage"
                ).textContent = "";

                openModal("usernameModal");

            }
        );


   document
    .getElementById("saveUsernameButton")
    .addEventListener(
        "click",
        async () => {

            if (!currentUser) {
                return;
            }

            const newUsername =
                document.getElementById(
                    "newUsername"
                ).value.trim();

            const message =
                document.getElementById(
                    "usernameMessage"
                );

            message.className =
                "auth-message";

            // ==========================================
            // VALIDATION
            // ==========================================

            if (newUsername.length < 2) {

                message.classList.add("error");

                message.textContent =
                    "Username must be at least 2 characters.";

                return;
            }

            if (
                !/^[a-zA-Z0-9_.-]+$/.test(
                    newUsername
                )
            ) {

                message.classList.add("error");

                message.textContent =
                    "Username contains invalid characters.";

                return;
            }


            const newKey =
                newUsername.toLowerCase();

            const oldKey =
                currentUsername.toLowerCase();


            // ==========================================
            // SAME USERNAME
            // ==========================================

            if (newKey === oldKey) {

                closeModal("usernameModal");

                return;
            }


            try {

                // ==========================================
                // CHECK IF NEW USERNAME IS TAKEN
                // ==========================================

                const newUsernameRef =
                    doc(
                        db,
                        "usernames",
                        newKey
                    );

                const existing =
                    await getDoc(
                        newUsernameRef
                    );

                if (existing.exists()) {

                    message.classList.add(
                        "error"
                    );

                    message.textContent =
                        "That username is already taken.";

                    return;
                }


                // ==========================================
                // CREATE NEW USERNAME RECORD
                // ==========================================

                await setDoc(
                    newUsernameRef,
                    {
                        uid:
                            currentUser.uid,

                        username:
                            newUsername
                    }
                );


                // ==========================================
                // DELETE OLD USERNAME RECORD
                // ==========================================

                const oldUsernameRef =
                    doc(
                        db,
                        "usernames",
                        oldKey
                    );

                const oldUsernameSnapshot =
                    await getDoc(
                        oldUsernameRef
                    );

                if (
                    oldUsernameSnapshot.exists()
                ) {

                    await deleteDoc(
                        oldUsernameRef
                    );

                }


                // ==========================================
                // UPDATE USER PROFILE
                // ==========================================

                await setDoc(
                    doc(
                        db,
                        "users",
                        currentUser.uid
                    ),
                    {
                        username:
                            newUsername,

                        email:
                            currentUser.email || ""
                    },
                    {
                        merge: true
                    }
                );


                // ==========================================
                // UPDATE LOCAL USERNAME
                // ==========================================

                currentUsername =
                    newUsername;


                const initials =
                    getInitials(
                        currentUsername
                    );


                document.getElementById(
                    "accountAvatar"
                ).textContent =
                    initials;


                document.getElementById(
                    "accountButtonText"
                ).textContent =
                    currentUsername;


                document.getElementById(
                    "sidebarAvatar"
                ).textContent =
                    initials;


                document.getElementById(
                    "sidebarUsername"
                ).textContent =
                    currentUsername;


                closeModal(
                    "usernameModal"
                );


                toast(
                    "Username updated."
                );


            } catch (error) {

                console.error(error);

                message.classList.add(
                    "error"
                );

                message.textContent =
                    error.message ||
                    "Unable to update username.";

            }

        }
    );


    /* =========================================================
       DELETE ACCOUNT
    ========================================================= */

    document
        .getElementById("deleteAccountButton")
        .addEventListener(
            "click",
            () => {

                document.getElementById(
                    "deletePassword"
                ).value = "";

                document.getElementById(
                    "deleteMessage"
                ).textContent = "";

                openModal(
                    "deleteAccountModal"
                );

            }
        );


document
    .getElementById("confirmDeleteButton")
    .addEventListener(
        "click",
        async () => {

            if (!currentUser) {
                return;
            }

            const password =
                document.getElementById(
                    "deletePassword"
                ).value;

            const message =
                document.getElementById(
                    "deleteMessage"
                );

            if (!password) {

                message.className =
                    "auth-message error";

                message.textContent =
                    "Enter your password.";

                return;
            }

            try {

                // ==========================================
                // 1. RE-AUTHENTICATE
                // ==========================================

                console.log(
                    "DELETE: Re-authenticating..."
                );

                const credential =
                    EmailAuthProvider.credential(
                        currentUser.email,
                        password
                    );

                await reauthenticateWithCredential(
                    currentUser,
                    credential
                );

                console.log(
                    "DELETE: Re-authentication successful"
                );


                // ==========================================
                // 2. GET USER PROFILE
                // ==========================================

                const userProfileRef =
                    doc(
                        db,
                        "users",
                        currentUser.uid
                    );

                const userProfileSnapshot =
                    await getDoc(
                        userProfileRef
                    );

                console.log(
                    "DELETE: User profile:",
                    userProfileSnapshot.exists()
                );


                // ==========================================
                // 3. DELETE USERNAME
                // ==========================================

                if (
                    userProfileSnapshot.exists()
                ) {

                    const profileData =
                        userProfileSnapshot.data();

                    const username =
                        profileData.username;

                    console.log(
                        "DELETE: Username:",
                        username
                    );

                    if (username) {

                        console.log(
                            "DELETE: Deleting username document..."
                        );

                        await deleteDoc(
                            doc(
                                db,
                                "usernames",
                                username.toLowerCase()
                            )
                        );

                        console.log(
                            "DELETE: Username deleted"
                        );

                    }
                }


                // ==========================================
                // 4. DELETE USER PROFILE
                // ==========================================

                console.log(
                    "DELETE: Deleting user profile..."
                );

                await deleteDoc(
                    userProfileRef
                );

                console.log(
                    "DELETE: User profile deleted"
                );


                // ==========================================
                // 5. DELETE AUTH ACCOUNT
                // ==========================================

                console.log(
                    "DELETE: Deleting Firebase Auth account..."
                );

                await deleteUser(
                    currentUser
                );

                console.log(
                    "DELETE: Firebase Auth account deleted"
                );


                // ==========================================
                // 6. FINISHED
                // ==========================================

                closeModal(
                    "deleteAccountModal"
                );

                closeSidebar();

                toast(
                    "Account deleted."
                );

            } catch (error) {

                console.error(
                    "================================"
                );

                console.error(
                    "ACCOUNT DELETE FAILED"
                );

                console.error(
                    "Error code:",
                    error.code
                );

                console.error(
                    "Error message:",
                    error.message
                );

                console.error(
                    "Full error:",
                    error
                );

                console.error(
                    "================================"
                );

                message.className =
                    "auth-message error";

                message.textContent =
                    friendlyAuthError(error);

            }

        }
    );


    /* =========================================================
       ADMIN: ADD LOCATION
    ========================================================= */

    document
        .getElementById("addLocationButton")
        .addEventListener(
            "click",
            () => {

                if (
                    !currentUser ||
                    currentUser.uid !== ADMIN_UID
                ) {
                    toast(
                        "You do not have permission to add locations."
                    );

                    return;
                }

                closeSidebar();

                locationModalMode = "add";
                editingLocationId = null;

                resetLocationForm();

                document.getElementById(
                    "locationModalTitle"
                ).textContent =
                    "Add location";

                document.getElementById(
                    "publishLocationButton"
                ).textContent =
                    "Publish";

                openModal(
                    "locationModal"
                );
setTimeout(() => {

    locationPickerMap.invalidateSize();

}, 200);
            }
        );


    function resetLocationForm() {

        document.getElementById(
            "locationName"
        ).value = "";

        document.getElementById(
            "locationDescription"
        ).value = "";

        document.querySelectorAll(
            ".location-tag"
        ).forEach(
            checkbox =>
                checkbox.checked = false
        );


        selectedLatLng = null;

if (adminMarker) {

    locationPickerMap.removeLayer(
        adminMarker
    );

    adminMarker = null;

}


        document.getElementById(
            "selectedLocation"
        ).textContent =
            "Click anywhere on the UK map to select a location.";

    }


    /* =========================================================
       ADMIN MAP PICKER
    ========================================================= */

  locationPickerMap.on(
    "click",
    event => {

        if (
            !currentUser ||
            currentUser.uid !== ADMIN_UID
        ) {
            return;
        }


        if (
            !document
                .getElementById("locationModal")
                .classList
                .contains("open")
        ) {
            return;
        }


        const lat =
            event.latlng.lat;

        const lng =
            event.latlng.lng;


        if (
            !isUKCoordinate(
                lat,
                lng
            )
        ) {

            toast(
                "That point is outside the UK."
            );

            return;
        }


        selectedLatLng = {
            lat,
            lng
        };


        if (adminMarker) {

            adminMarker.setLatLng(
                [lat, lng]
            );

        } else {

            adminMarker =
                L.marker(
                    [lat, lng],
                    {
                        draggable: true
                    }
                ).addTo(locationPickerMap);


            adminMarker.on(
                "dragend",
                event => {

                    const position =
                        event.target.getLatLng();


                    if (
                        !isUKCoordinate(
                            position.lat,
                            position.lng
                        )
                    ) {

                        toast(
                            "The marker must remain within the UK."
                        );


                        adminMarker.setLatLng([
                            selectedLatLng.lat,
                            selectedLatLng.lng
                        ]);


                        return;
                    }


                    selectedLatLng = {

                        lat:
                            position.lat,

                        lng:
                            position.lng

                    };


                    updateSelectedLocationText();

                }
            );

        }


        updateSelectedLocationText();

    }
);


    function updateSelectedLocationText() {

        if (!selectedLatLng) {
            return;
        }

        document.getElementById(
            "selectedLocation"
        ).textContent =
            `Selected: ${
                selectedLatLng.lat.toFixed(6)
            }, ${
                selectedLatLng.lng.toFixed(6)
            }`;

    }


    /* =========================================================
       ADMIN: PUBLISH / EDIT
    ========================================================= */

    document
        .getElementById("publishLocationButton")
        .addEventListener(
            "click",
            async () => {

                if (
                    !currentUser ||
                    currentUser.uid !== ADMIN_UID
                ) {

                    toast(
                        "You do not have permission to do this."
                    );

                    return;

                }


                if (!selectedLatLng) {

                    toast(
                        "Click the map to choose a location."
                    );

                    return;

                }


                const name =
                    document.getElementById(
                        "locationName"
                    ).value.trim();

                const description =
                    document.getElementById(
                        "locationDescription"
                    ).value.trim();

                const tags =
                    Array.from(
                        document.querySelectorAll(
                            ".location-tag:checked"
                        )
                    ).map(
                        checkbox =>
                            checkbox.value
                    );


                if (!name) {

                    toast(
                        "Enter a location name."
                    );

                    return;

                }


                if (!description) {

                    toast(
                        "Enter a description."
                    );

                    return;

                }


                if (!tags.length) {

                    toast(
                        "Select at least one tag."
                    );

                    return;

                }


                const button =
                    document.getElementById(
                        "publishLocationButton"
                    );

                button.disabled = true;
                button.textContent =
                    "Saving...";


                try {

                    const locationData = {

                        name,

                        description,

                        tags,

                        latitude:
                            selectedLatLng.lat,

                        longitude:
                            selectedLatLng.lng,

                        active: true,

                        updatedAt:
                            serverTimestamp(),

                        updatedBy:
                            currentUser.uid

                    };


                    if (
                        locationModalMode === "add"
                    ) {

                        locationData.createdAt =
                            serverTimestamp();

                        locationData.createdBy =
                            currentUser.uid;


                        await addDoc(
                            collection(
                                db,
                                "locations"
                            ),
                            locationData
                        );

                        toast(
                            "Location published."
                        );

                    } else {

                        await updateDoc(
                            doc(
                                db,
                                "locations",
                                editingLocationId
                            ),
                            locationData
                        );

                        toast(
                            "Location updated."
                        );

                    }


                    closeModal(
                        "locationModal"
                    );

                    await loadLocations();

                } catch (error) {

                    console.error(error);

                    toast(
                        error.message ||
                        "Unable to save location."
                    );

                } finally {

                    button.disabled = false;

                    button.textContent =
                        locationModalMode === "add"
                            ? "Publish"
                            : "Save changes";

                }

            }
        );


    document
        .getElementById("cancelLocationButton")
        .addEventListener(
            "click",
            () => {

                closeModal(
                    "locationModal"
                );

            }
        );


    /* =========================================================
       ADMIN EDIT
    ========================================================= */

    window.editExplorerLocation =
        async function(locationId) {

            if (
                !currentUser ||
                currentUser.uid !== ADMIN_UID
            ) {
                toast(
                    "You do not have permission."
                );

                return;
            }


            const location =
                allLocations.find(
                    item =>
                        item.id === locationId
                );


            if (!location) {
                return;
            }


            locationModalMode = "edit";
            editingLocationId = locationId;


            document.getElementById(
                "locationModalTitle"
            ).textContent =
                "Edit location";


            document.getElementById(
                "publishLocationButton"
            ).textContent =
                "Save changes";


            document.getElementById(
                "locationName"
            ).value =
                location.name || "";


            document.getElementById(
                "locationDescription"
            ).value =
                location.description || "";


            document.querySelectorAll(
                ".location-tag"
            ).forEach(
                checkbox => {

                    checkbox.checked =
                        Array.isArray(location.tags) &&
                        location.tags.includes(
                            checkbox.value
                        );

                }
            );


            if (
                typeof location.latitude === "number" &&
                typeof location.longitude === "number"
            ) {

                selectedLatLng = {

                    lat:
                        location.latitude,

                    lng:
                        location.longitude

                };


                if (adminMarker) {

                    map.removeLayer(
                        adminMarker
                    );

                }


                adminMarker =
                    L.marker(
                        [
                            location.latitude,
                            location.longitude
                        ],
                        {
                            draggable: true
                        }
                    ).addTo(map);


                adminMarker.on(
                    "dragend",
                    event => {

                        const position =
                            event.target.getLatLng();

                        if (
                            !isUKCoordinate(
                                position.lat,
                                position.lng
                            )
                        ) {

                            toast(
                                "The marker must remain within the UK."
                            );

                            adminMarker.setLatLng([
                                selectedLatLng.lat,
                                selectedLatLng.lng
                            ]);

                            return;
                        }


                        selectedLatLng = {
                            lat:
                                position.lat,
                            lng:
                                position.lng
                        };


                        updateSelectedLocationText();

                    }
                );


                updateSelectedLocationText();


               locationPickerMap.setView(
    [
        location.latitude,
        location.longitude
    ],
    Math.max(
        locationPickerMap.getZoom(),
        10
    )
);

            }


            openModal(
                "locationModal"
            );
setTimeout(() => {

    locationPickerMap.invalidateSize();

}, 200);
        };


    /* =========================================================
       ADMIN DELETE
    ========================================================= */

    window.deleteExplorerLocation =
        async function(locationId) {

            if (
                !currentUser ||
                currentUser.uid !== ADMIN_UID
            ) {
                toast(
                    "You do not have permission."
                );

                return;
            }


            const location =
                allLocations.find(
                    item =>
                        item.id === locationId
                );


            if (!location) {
                return;
            }


            const confirmed =
                window.confirm(
                    `Delete "${location.name}"? This cannot be undone.`
                );


            if (!confirmed) {
                return;
            }


            try {

                await deleteDoc(
                    doc(
                        db,
                        "locations",
                        locationId
                    )
                );

                toast(
                    "Location deleted."
                );

                await loadLocations();

            } catch (error) {

                console.error(error);

                toast(
                    error.message ||
                    "Unable to delete location."
                );

            }

        };


    /* =========================================================
       MY LOCATION
    ========================================================= */

    document
        .getElementById("myLocationButton")
        .addEventListener(
            "click",
            () => {

                if (
                    !navigator.geolocation
                ) {

                    toast(
                        "Your browser does not support location services."
                    );

                    return;

                }


                toast(
                    "Requesting your location..."
                );


                navigator.geolocation.getCurrentPosition(
                    position => {

                        const lat =
                            position.coords.latitude;

                        const lng =
                            position.coords.longitude;


                        map.setView(
                            [lat, lng],
                            14
                        );


                        L.circleMarker(
                            [lat, lng],
                            {
                                radius: 8
                            }
                        )
                        .addTo(map)
                        .bindPopup(
                            "Your location"
                        )
                        .openPopup();


                    },
                    error => {

                        console.error(error);

                        toast(
                            "Location permission was denied or unavailable."
                        );

                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 30000
                    }
                );

            }
        );


    /* =========================================================
       INITIAL LOAD
    ========================================================= */

    await loadLocations();


    /* =========================================================
       CLOSE MODALS WHEN CLICKING OUTSIDE
    ========================================================= */

    document
        .querySelectorAll(".modal-overlay")
        .forEach(overlay => {

            overlay.addEventListener(
                "click",
                event => {

                    if (
                        event.target === overlay
                    ) {

                        overlay.classList.remove(
                            "open"
                        );

                    }

                }
            );

        });

        /* =========================================================
   MAP LAYERS
========================================================= */

/* MAIN MAP */

const mainStreetLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            '&copy; OpenStreetMap contributors'
    }
);

const mainSatelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution:
            'Tiles &copy; Esri'
    }
);


/* ADMIN PICKER */

const pickerStreetLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            '&copy; OpenStreetMap contributors'
    }
);

const pickerSatelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution:
            'Tiles &copy; Esri'
    }
);


/* Defaults */

mainStreetLayer.addTo(map);
pickerStreetLayer.addTo(locationPickerMap);

/* =========================================================
   MAP TYPE SWITCHING
========================================================= */

/* MAIN MAP */

document
    .getElementById("mainStreetButton")
    .addEventListener("click", () => {

        map.removeLayer(mainSatelliteLayer);
        mainStreetLayer.addTo(map);

        document
            .getElementById("mainStreetButton")
            .classList.add("active");

        document
            .getElementById("mainSatelliteButton")
            .classList.remove("active");

    });


document
    .getElementById("mainSatelliteButton")
    .addEventListener("click", () => {

        map.removeLayer(mainStreetLayer);
        mainSatelliteLayer.addTo(map);

        document
            .getElementById("mainStreetButton")
            .classList.remove("active");

        document
            .getElementById("mainSatelliteButton")
            .classList.add("active");

    });


/* ADMIN PICKER */

document
    .getElementById("pickerStreetButton")
    .addEventListener("click", () => {

        locationPickerMap.removeLayer(
            pickerSatelliteLayer
        );

        pickerStreetLayer.addTo(
            locationPickerMap
        );

        document
            .getElementById("pickerStreetButton")
            .classList.add("active");

        document
            .getElementById("pickerSatelliteButton")
            .classList.remove("active");

    });


document
    .getElementById("pickerSatelliteButton")
    .addEventListener("click", () => {

        locationPickerMap.removeLayer(
            pickerStreetLayer
        );

        pickerSatelliteLayer.addTo(
            locationPickerMap
        );

        document
            .getElementById("pickerStreetButton")
            .classList.remove("active");

        document
            .getElementById("pickerSatelliteButton")
            .classList.add("active");

    });

    // =========================================================
// EXPLORER SAFETY NOTICE
// =========================================================

const safetyNotice = document.getElementById("safetyNotice");
const safetyAgree = document.getElementById("safetyAgree");

if (safetyNotice && safetyAgree) {

    // Show the notice every time the page is opened
    safetyNotice.classList.remove("hidden");

    safetyAgree.addEventListener("click", () => {

        safetyNotice.classList.add("hidden");

    });

}
