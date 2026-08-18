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

    const marker = L.marker([
        location.latitude,
        location.longitude
    ]).addTo(map);

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

    const tagHtml =
        tags
            .slice(0, 3)
            .map(tag => `
                <span class="map-popup-tag">
                    ${escapeHtml(tag)}
                </span>
            `)
            .join("");


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

            <button
                type="button"
                class="map-popup-more"
                data-location-id="${escapeHtml(location.id)}"
            >
                Find out more
                <span>→</span>
            </button>

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

    marker.on(
    "mouseover",
    () => {

        marker.openPopup();

    }
);


    /*
        Open the popup when the marker is clicked.
    */

    marker.on(
        "click",
        () => {

            marker.openPopup();

        }
    );


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

<div class="tags">
    ${tagHtml}
</div>

<div class="location-card-actions">

    ${saveButton}

</div>

${adminActions}

                    </article>
                `;

            }).join("");

    }


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

            return;

        }

        const data =
            snapshot.data();

        currentUserSavedLocations =
            Array.isArray(data.savedLocations)
                ? data.savedLocations
                : [];

        currentUserViewedLocations =
            Array.isArray(data.viewedLocations)
                ? data.viewedLocations
                : [];

                updateUserStats(data);

    } catch (error) {

        console.error(
            "Unable to load explore data:",
            error
        );

        currentUserSavedLocations = [];
        currentUserViewedLocations = [];

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


    /*
        User is signed out
    */

    if (!currentUser) {

        exploreSince.textContent = "—";

        locationsViewedCount.textContent = "0";

        locationsSavedCount.textContent = "0";

        return;

    }


    /*
        Locations viewed
    */

    locationsViewedCount.textContent =
        Array.isArray(currentUserViewedLocations)
            ? currentUserViewedLocations.length
            : 0;


    /*
        Locations saved
    */

    locationsSavedCount.textContent =
        Array.isArray(currentUserSavedLocations)
            ? currentUserSavedLocations.length
            : 0;


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

        exploreSince.textContent =
            createdAt.toLocaleDateString(
                "en-GB",
                {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                }
            );

    } else {

        exploreSince.textContent =
            "—";

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
   RECORD VIEWED LOCATION
========================================================= */

async function recordLocationViewed(locationId) {

    if (!currentUser) {
        return;
    }

    if (
        currentUserViewedLocations.includes(locationId)
    ) {
        return;
    }

    try {

        currentUserViewedLocations.push(
            locationId
        );

        updateUserStats();

        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            {
                viewedLocations:
                    currentUserViewedLocations
            },
            {
                merge: true
            }
        );

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

    exploreViewTitle.textContent =
        mode === "saved"
            ? "Saved locations"
            : "Locations viewed";


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

    const ids =
        exploreViewMode === "saved"
            ? currentUserSavedLocations
            : currentUserViewedLocations;

    let locations =
        ids
            .map(id =>
                allLocations.find(
                    location =>
                        location.id === id
                )
            )
            .filter(Boolean);


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
                            : "No locations viewed"
                    }
                </div>

                <div class="explore-empty-text">
                    ${
                        exploreViewMode === "saved"
                            ? "Locations you save will appear here."
                            : "Locations you explore will appear here."
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
                    data-explore-location="${escapeHtml(location.id)}"
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
                "[data-explore-location]"
            );

        if (!item) {
            return;
        }

        const locationId =
            item.dataset.exploreLocation;

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
       AUTH STATE
    ========================================================= */

    onAuthStateChanged(
        auth,
        async user => {

            currentUser = user;

            if (user) {

    await loadUserExploreData();

} else {

    currentUserSavedLocations = [];
    currentUserViewedLocations = [];

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


            document.getElementById(
                "loggedOutAccount"
            ).style.display = "none";

            document.getElementById(
                "loggedInAccount"
            ).style.display = "block";


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
