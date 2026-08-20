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
    deleteField,
    query,
    where,
    orderBy,
    serverTimestamp,
    writeBatch
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
    let currentUserData = {};

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

        const notificationsButton =
    document.getElementById("notificationsButton");

const notificationBadge =
    document.getElementById("notificationBadge");

const openNotificationsButton =
    document.getElementById("openNotificationsButton");

const sidebarNotificationBadge =
    document.getElementById("sidebarNotificationBadge");

const notificationSummary =
    document.getElementById("notificationSummary");

const notificationsView =
    document.getElementById("notificationsView");

const notificationsBackButton =
    document.getElementById("notificationsBackButton");

const notificationsCloseButton =
    document.getElementById("notificationsCloseButton");

const notificationsList =
    document.getElementById("notificationsList");

const markNotificationsReadButton =
    document.getElementById("markNotificationsReadButton");

    /* =========================================================
   Notifications UI
========================================================= */

function openNotificationsView() {

    if (!notificationsView) {
        console.error("notificationsView element not found.");
        return;
    }

    // Open the account sidebar
    if (typeof openSidebar === "function") {
        openSidebar();
    } else if (accountSidebar) {
        accountSidebar.classList.add("open");
    }

    // Hide the normal account content
// Hide the normal account header
const sidebarHeader =
    accountSidebar?.querySelector(".sidebar-header");

if (sidebarHeader) {
    sidebarHeader.style.display = "none";
}

// Hide the normal account content
const loggedOutAccount =
    document.getElementById("loggedOutAccount");

const loggedInAccount =
    document.getElementById("loggedInAccount");

if (loggedOutAccount) {
    loggedOutAccount.style.display = "none";
}

if (loggedInAccount) {
    loggedInAccount.style.display = "none";
}

// Hide explore locations view
if (
    typeof exploreLocationsView !== "undefined" &&
    exploreLocationsView
) {
    exploreLocationsView.style.display = "none";
}

// Show notifications
notificationsView.style.display = "flex";

    // Load notifications
    loadNotifications();
}


function closeNotificationsView() {

    if (!notificationsView) return;

    notificationsView.style.display = "none";

    // Restore the normal sidebar header
const sidebarHeader =
    accountSidebar?.querySelector(".sidebar-header");

if (sidebarHeader) {
    sidebarHeader.style.display = "flex";
}

    // Show the normal account area again
    const loggedOutAccount =
        document.getElementById("loggedOutAccount");

    const loggedInAccount =
        document.getElementById("loggedInAccount");

    if (auth.currentUser) {

        if (loggedInAccount) {
            loggedInAccount.style.display = "block";
        }

    } else {

        if (loggedOutAccount) {
            loggedOutAccount.style.display = "block";
        }

    }

    // If this was opened from the sidebar, leave the sidebar open.
    // The normal account content is now visible again.
}


openNotificationsButton?.addEventListener(
    "click",
    openNotificationsView
);


notificationsButton?.addEventListener(
    "click",
    openNotificationsView
);


notificationsBackButton?.addEventListener(
    "click",
    closeNotificationsView
);


notificationsCloseButton?.addEventListener(
    "click",
    () => {

        closeNotificationsView();

        if (typeof closeSidebar === "function") {
            closeSidebar();
        } else if (accountSidebar) {
            accountSidebar.classList.remove("open");
        }

    }
);

/* =========================================================
   FORMAT NOTIFICATION DATE
========================================================= */

function formatNotificationDate(timestamp) {

    if (!timestamp) {
        return "Unknown date";
    }

    let date = timestamp;

    // Firestore Timestamp
    if (
        timestamp &&
        typeof timestamp.toDate === "function"
    ) {
        date = timestamp.toDate();
    }

    // Convert numeric timestamps if necessary
    else if (typeof timestamp === "number") {
        date = new Date(timestamp);
    }

    // Convert date strings if necessary
    else if (typeof timestamp === "string") {
        date = new Date(timestamp);
    }

    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Unknown date";
    }

    return date.toLocaleString(
        "en-GB",
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


async function loadNotifications() {

    if (!auth.currentUser) {

        renderNotifications([]);
        updateNotificationBadges(0);

        return;
    }

    try {

const q = query(
    collection(db, "notifications"),
    where(
        "userId",
        "==",
        auth.currentUser.uid
    )
);

        const snapshot = await getDocs(q);

const notifications =
    snapshot.docs
        .map(notificationDoc => ({
            id: notificationDoc.id,
            ...notificationDoc.data()
        }))
        .sort((a, b) => {

            const aTime =
                a.createdAt?.toMillis?.() || 0;

            const bTime =
                b.createdAt?.toMillis?.() || 0;

            return bTime - aTime;
        });

        renderNotifications(notifications);

        const unreadCount =
            notifications.filter(
                notification =>
                    notification.read !== true
            ).length;

        updateNotificationBadges(unreadCount);

    } catch (error) {

        console.error(
            "Unable to load notifications:",
            error
        );

        // Still show the notifications screen even if
        // Firestore fails.
        if (notificationsList) {

            notificationsList.innerHTML = `
                <div class="empty-state">

                    <div class="explore-empty-title">
                        Unable to load notifications
                    </div>

                    <div class="explore-empty-text">
                        Please try again later.
                    </div>

                </div>
            `;

        }

    }
}

/* =========================================================
   NOTIFICATION AUTH INITIALISATION
========================================================= */

onAuthStateChanged(auth, user => {

    if (user) {

        // User is logged in.
        // Load notifications immediately so
        // the navbar badge appears on page load.
        loadNotifications();

    } else {

        // User is logged out.
        // Remove the notification badge.
        updateNotificationBadges(0);

    }

});


function renderNotifications(notifications) {

    if (!notificationsList) return;

    if (!notifications.length) {

        notificationsList.innerHTML = `
            <div class="empty-state">

                <div class="explore-empty-title">
                    No notifications
                </div>

                <div class="explore-empty-text">
                    You're all caught up.
                </div>

            </div>
        `;

        return;
    }

    notificationsList.innerHTML =
        notifications.map(notification => {

            const unread =
                notification.read !== true;

            return `
                <div
                    class="notification-item ${unread ? "unread" : ""}"
                    data-notification-id="${notification.id}"
                >

                    <div class="notification-item-icon">
                        ${
                            notification.type === "takedown_approved"
                                ? "✓"
                                : notification.type === "takedown_declined"
                                    ? "!"
                                    : "•"
                        }
                    </div>

                    <div class="notification-item-content">

                        <div class="notification-item-top">

                            <div class="notification-item-title">
                                ${escapeHtml(
                                    notification.title ||
                                    "Notification"
                                )}
                            </div>

                            ${
                                unread
                                    ? `<span class="notification-unread-dot"></span>`
                                    : ""
                            }

                        </div>

                        <div class="notification-item-description">
                            ${escapeHtml(
                                notification.description || ""
                            )}
                        </div>

                        <div class="notification-item-footer">

                            <div class="notification-item-date">
                                ${formatNotificationDate(
                                    notification.createdAt
                                )}
                            </div>

                            <button
                                type="button"
                                class="button notification-clear-button"
                                data-clear-notification="${notification.id}"
                            >
                                Clear
                            </button>

                        </div>

                    </div>

                </div>
            `;

        }).join("");

}

/* =========================================================
   NOTIFICATION CLICK EVENTS
========================================================= */

notificationsList?.addEventListener("click", async event => {

    /* ---------------------------------------------------------
       CLEAR BUTTON
    --------------------------------------------------------- */

    const clearButton = event.target.closest(
        ".notification-clear-button"
    );

    if (clearButton) {

        event.preventDefault();
        event.stopPropagation();

        const notificationId =
            clearButton.getAttribute(
                "data-clear-notification"
            );

        console.log(
            "Clear notification clicked:",
            notificationId
        );

        if (!notificationId) {

            console.error(
                "Clear button has no notification ID."
            );

            return;
        }

        await clearNotification(notificationId);

        return;
    }


    /* ---------------------------------------------------------
       NOTIFICATION ITEM
    --------------------------------------------------------- */

    const notificationItem =
        event.target.closest(".notification-item");

    if (!notificationItem) {
        return;
    }

    const notificationId =
        notificationItem.getAttribute(
            "data-notification-id"
        );

    if (!notificationId) {
        return;
    }

    await markNotificationRead(notificationId);

});
/* =========================================================
   CLEAR SINGLE NOTIFICATION
========================================================= */

/* =========================================================
   CLEAR SINGLE NOTIFICATION
========================================================= */

async function clearNotification(notificationId) {

    console.log(
        "Attempting to clear notification:",
        notificationId
    );

    if (!notificationId) {

        console.error(
            "No notification ID supplied."
        );

        return;
    }

    if (!auth.currentUser) {

        console.error(
            "Cannot clear notification: user is not logged in."
        );

        return;
    }

    try {

        const notificationRef = doc(
            db,
            "notifications",
            notificationId
        );

        const notificationSnapshot =
            await getDoc(notificationRef);


        /* ---------------------------------------------------------
           Check document exists
        --------------------------------------------------------- */

        if (!notificationSnapshot.exists()) {

            console.error(
                "Notification document does not exist:",
                notificationId
            );

            return;
        }


        const notification =
            notificationSnapshot.data();


        /* ---------------------------------------------------------
           Security check
        --------------------------------------------------------- */

        if (
            notification.userId !==
            auth.currentUser.uid
        ) {

            console.error(
                "Cannot clear another user's notification."
            );

            return;
        }


        /* ---------------------------------------------------------
           Delete notification
        --------------------------------------------------------- */

        await deleteDoc(
            notificationRef
        );

        console.log(
            "Notification successfully cleared:",
            notificationId
        );


        /* ---------------------------------------------------------
           Refresh notification list
        --------------------------------------------------------- */

        await loadNotifications();


    } catch (error) {

        console.error(
            "Unable to clear notification:",
            error
        );

    }
}

/* =========================================================
   CLEAR NOTIFICATION BUTTON EVENTS
========================================================= */


function updateNotificationBadges(count) {

    const hasNotifications = count > 0;

    if (notificationBadge) {

        notificationBadge.textContent =
            count > 99 ? "99+" : count;

        notificationBadge.style.display =
            hasNotifications
                ? "flex"
                : "none";
    }

    if (sidebarNotificationBadge) {

        sidebarNotificationBadge.textContent =
            count > 99 ? "99+" : count;

        sidebarNotificationBadge.style.display =
            hasNotifications
                ? "inline-flex"
                : "none";
    }

    if (notificationSummary) {

        notificationSummary.textContent =
            count === 0
                ? "No new notifications"
                : count === 1
                    ? "1 new notification"
                    : `${count} new notifications`;
    }
}


async function markNotificationRead(notificationId) {

    if (!notificationId) return;

    try {

        await updateDoc(
            doc(
                db,
                "notifications",
                notificationId
            ),
            {
                read: true
            }
        );

        await loadNotifications();

    } catch (error) {

        console.error(
            "Unable to mark notification as read:",
            error
        );

    }
}


markNotificationsReadButton?.addEventListener(
    "click",
    async () => {

        if (!auth.currentUser) return;

        try {

            const q = query(
                collection(db, "notifications"),
                where(
                    "userId",
                    "==",
                    auth.currentUser.uid
                ),
                where(
                    "read",
                    "==",
                    false
                )
            );

            const snapshot = await getDocs(q);

            await Promise.all(
                snapshot.docs.map(notification =>
                    updateDoc(
                        notification.ref,
                        {
                            read: true
                        }
                    )
                )
            );

            await loadNotifications();

        } catch (error) {

            console.error(
                "Unable to mark notifications as read:",
                error
            );

        }

    }
);


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
   ACCOUNT PROFILE DROPDOWN
========================================================= */

const accountProfileToggle =
    document.getElementById(
        "accountProfileToggle"
    );

const accountProfileDetails =
    document.getElementById(
        "accountProfileDetails"
    );

const statsDropdownButton =
    document.getElementById("statsDropdownButton");

const statsProfileDetails =
    document.getElementById("statsProfileDetails");

statsDropdownButton.addEventListener("click", () => {

    const isOpen =
        statsProfileDetails.style.display !== "none";

    statsProfileDetails.style.display =
        isOpen ? "none" : "block";

});
    

const accountProfileArrow =
    document.getElementById(
        "accountProfileArrow"
    );

const accountDetailUsername =
    document.getElementById(
        "accountDetailUsername"
    );

const accountDetailEmail =
    document.getElementById(
        "accountDetailEmail"
    );


if (accountProfileToggle) {

    accountProfileToggle.addEventListener(
        "click",
        () => {

            const isOpen =
                accountProfileDetails.style.display !== "none";

            if (isOpen) {

                accountProfileDetails.style.display = "none";

                accountProfileToggle.setAttribute(
                    "aria-expanded",
                    "false"
                );

            } else {

                accountProfileDetails.style.display = "block";

                accountProfileToggle.setAttribute(
                    "aria-expanded",
                    "true"
                );

            }

            // Keep the arrow exactly the same
            accountProfileArrow.textContent = "›";

        }
    );

}


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
    typeof location.ratingAverage === "number" &&
    typeof location.ratingCount === "number" &&
    location.ratingCount > 0
        ? location.ratingAverage
        : null;

const ratingCount =
    typeof location.ratingCount === "number" &&
    location.ratingCount > 0
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
   TAKEDOWN REQUEST SYSTEM
========================================================= */

const TAKEDOWN_MAX_LOCATIONS = 5;
const TAKEDOWN_MAX_REASON_LENGTH = 2000;
const TAKEDOWN_MIN_REASON_LENGTH = 10;

let selectedTakedownLocationIds = [];
let takedownSearchTerm = "";

let adminTakedownStatus = "pending";
let adminReportsSection = "takedowns";


/* =========================================================
   TAKEDOWN DOM
========================================================= */

const requestTakedownButton =
    document.getElementById("requestTakedownButton");

const takedownRequestsButton =
    document.getElementById("takedownRequestsButton");

const reportsButton =
    document.getElementById("reportsButton");

const takedownLocationSearch =
    document.getElementById("takedownLocationSearch");

const takedownLocationResults =
    document.getElementById("takedownLocationResults");

const takedownSelectedLocations =
    document.getElementById("takedownSelectedLocations");

const takedownSelectionCount =
    document.getElementById("takedownSelectionCount");

const takedownReason =
    document.getElementById("takedownReason");

const takedownReasonCount =
    document.getElementById("takedownReasonCount");

const takedownRequestMessage =
    document.getElementById("takedownRequestMessage");

const submitTakedownRequestButton =
    document.getElementById("submitTakedownRequestButton");

const myTakedownRequestsContent =
    document.getElementById("myTakedownRequestsContent");

const adminTakedownRequests =
    document.getElementById("adminTakedownRequests");

const reportsTakedownsTab =
    document.getElementById("reportsTakedownsTab");

const reportsAdditionsTab =
    document.getElementById("reportsAdditionsTab");


/* =========================================================
   HELPERS
========================================================= */

function setTakedownMessage(message, good = false) {

    if (!takedownRequestMessage) {
        return;
    }

    takedownRequestMessage.textContent =
        message || "";

    takedownRequestMessage.classList.toggle(
        "good",
        good
    );

    takedownRequestMessage.classList.toggle(
        "bad",
        !good && !!message
    );

    takedownRequestMessage.style.display =
        message
            ? "block"
            : "none";
}


function formatTakedownDate(timestamp) {

    if (!timestamp) {
        return "Unknown date";
    }

    let date = timestamp;

    if (
        timestamp &&
        typeof timestamp.toDate === "function"
    ) {
        date = timestamp.toDate();
    }

    if (!(date instanceof Date)) {
        return "Unknown date";
    }

    return date.toLocaleString(
        "en-GB",
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function getTakedownStatusLabel(status) {

    if (status === "approved") {
        return "Approved";
    }

    if (status === "declined") {
        return "Declined";
    }

    return "Under review";
}


function isExplorerAdmin() {

    return !!(
        currentUser &&
        currentUser.uid === ADMIN_UID
    );
}


function getLocationById(locationId) {

    if (!Array.isArray(allLocations)) {
        return null;
    }

    return allLocations.find(
        location => location.id === locationId
    ) || null;
}


function getLocationName(locationId) {

    const location =
        getLocationById(locationId);

    return location?.name ||
        "Location unavailable";
}


/* =========================================================
   OPEN USER REQUEST MODAL
========================================================= */

function openTakedownRequestModal() {

    if (!currentUser) {

        toast(
            "Sign in to submit a takedown request."
        );

        return;
    }

    selectedTakedownLocationIds = [];
    takedownSearchTerm = "";

    if (takedownLocationSearch) {
        takedownLocationSearch.value = "";
    }

    if (takedownReason) {
        takedownReason.value = "";
    }

    if (takedownReasonCount) {
        takedownReasonCount.textContent =
            `0 / ${TAKEDOWN_MAX_REASON_LENGTH}`;
    }

    setTakedownMessage("");

    renderTakedownLocationResults();
    renderSelectedTakedownLocations();

    openModal("takedownRequestModal");
}


/* =========================================================
   LOCATION SEARCH
========================================================= */

function renderTakedownLocationResults() {

    if (!takedownLocationResults) {
        return;
    }

    const search =
        String(takedownSearchTerm || "")
            .trim()
            .toLowerCase();

    let locations =
        Array.isArray(allLocations)
            ? [...allLocations]
            : [];

    if (search) {

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
                    name.includes(search) ||
                    description.includes(search) ||
                    tags.some(tag =>
                        String(tag)
                            .toLowerCase()
                            .includes(search)
                    )
                );
            });
    }

    /*
        Keep the results list manageable.
        Searching still happens across all loaded
        locations before the 30-result limit.
    */
    locations = locations.slice(0, 30);

    if (!locations.length) {

        takedownLocationResults.innerHTML = `
            <div class="empty-state">
                No locations found.
            </div>
        `;

        return;
    }

    takedownLocationResults.innerHTML =
        locations.map(location => {

            const selected =
                selectedTakedownLocationIds.includes(
                    location.id
                );

            return `
                <button
                    type="button"
                    class="takedown-location-result ${selected ? "selected" : ""}"
                    data-takedown-select="${escapeHtml(location.id)}"
                >

                    <div>

                        <div class="takedown-location-name">
                            ${escapeHtml(
                                location.name ||
                                "Unnamed location"
                            )}
                        </div>

                        <div class="takedown-location-description">
                            ${escapeHtml(
                                String(
                                    location.description ||
                                    "No description provided."
                                ).slice(0, 120)
                            )}
                        </div>

                    </div>

                    <span class="takedown-location-check">
                        ${selected ? "✓" : "+"}
                    </span>

                </button>
            `;

        }).join("");
}


/* =========================================================
   SELECT / UNSELECT LOCATION
========================================================= */

function toggleTakedownLocation(locationId) {

    if (!locationId) {
        return;
    }

    const existingIndex =
        selectedTakedownLocationIds.indexOf(
            locationId
        );

    /*
        Remove existing selection.
    */

    if (existingIndex !== -1) {

        selectedTakedownLocationIds.splice(
            existingIndex,
            1
        );

    }

    /*
        Add new selection.
    */

    else {

        if (
            selectedTakedownLocationIds.length >=
            TAKEDOWN_MAX_LOCATIONS
        ) {

            toast(
                `You can select a maximum of ${TAKEDOWN_MAX_LOCATIONS} locations.`
            );

            return;
        }

        selectedTakedownLocationIds.push(
            locationId
        );
    }

    renderTakedownLocationResults();
    renderSelectedTakedownLocations();
}


/* =========================================================
   SELECTED LOCATIONS
========================================================= */

function renderSelectedTakedownLocations() {

    /*
        IMPORTANT:
        selectedTakedownLocationIds is the ARRAY.
        takedownSelectedLocations is the DOM element.
    */

    if (!takedownSelectedLocations) {
        return;
    }

    const selectedIds =
        Array.isArray(selectedTakedownLocationIds)
            ? selectedTakedownLocationIds
            : [];

    if (takedownSelectionCount) {

        takedownSelectionCount.textContent =
            `${selectedIds.length} / ${TAKEDOWN_MAX_LOCATIONS}`;
    }

    if (!selectedIds.length) {

        takedownSelectedLocations.innerHTML = `
            <div class="empty-state">
                No locations selected.
            </div>
        `;

        return;
    }

    takedownSelectedLocations.innerHTML =
        selectedIds.map(locationId => {

            const location =
                getLocationById(locationId);

            if (!location) {
                return "";
            }

            return `
                <div class="takedown-selected-item">

                    <span>
                        ${escapeHtml(
                            location.name ||
                            "Unnamed location"
                        )}
                    </span>

                    <button
                        type="button"
                        aria-label="Remove location"
                        data-takedown-remove="${escapeHtml(
                            location.id
                        )}"
                    >
                        ×
                    </button>

                </div>
            `;

        }).join("");
}


/* =========================================================
   CHECK FOR EXISTING ACTIVE REQUEST
========================================================= */

async function hasActiveTakedownRequest(locationIds) {

    if (!currentUser) {
        return false;
    }

    if (
        !Array.isArray(locationIds) ||
        !locationIds.length
    ) {
        return false;
    }

    const requestsSnapshot =
        await getDocs(
            query(
                collection(
                    db,
                    "takedownRequests"
                ),
                where(
                    "userId",
                    "==",
                    currentUser.uid
                ),
                where(
                    "status",
                    "==",
                    "pending"
                )
            )
        );

    for (
        const requestDoc
        of requestsSnapshot.docs
    ) {

        const data =
            requestDoc.data();

        const requested =
            Array.isArray(data.locationIds)
                ? data.locationIds
                : [];

        if (
            locationIds.some(
                id => requested.includes(id)
            )
        ) {
            return true;
        }
    }

    return false;
}


/* =========================================================
   SUBMIT TAKEDOWN REQUEST
========================================================= */

async function submitTakedownRequest() {

    if (!currentUser) {

        setTakedownMessage(
            "You must be signed in to submit a request."
        );

        return;
    }

    const selectedIds =
        Array.isArray(selectedTakedownLocationIds)
            ? [...selectedTakedownLocationIds]
            : [];

    if (!selectedIds.length) {

        setTakedownMessage(
            "Select at least one location."
        );

        return;
    }

    if (
        selectedIds.length >
        TAKEDOWN_MAX_LOCATIONS
    ) {

        setTakedownMessage(
            `You can select a maximum of ${TAKEDOWN_MAX_LOCATIONS} locations.`
        );

        return;
    }

    const reason =
        String(
            takedownReason?.value || ""
        ).trim();

    if (
        reason.length <
        TAKEDOWN_MIN_REASON_LENGTH
    ) {

        setTakedownMessage(
            "Please provide a little more detail about why you are requesting the takedown."
        );

        return;
    }

    if (
        reason.length >
        TAKEDOWN_MAX_REASON_LENGTH
    ) {

        setTakedownMessage(
            "Your reason is too long."
        );

        return;
    }

    /*
        Make sure every selected location still
        exists in the currently loaded locations.
    */

    const validLocationIds =
        selectedIds.filter(locationId =>
            Array.isArray(allLocations) &&
            allLocations.some(
                location => location.id === locationId
            )
        );

    if (
        validLocationIds.length !==
        selectedIds.length
    ) {

        setTakedownMessage(
            "One or more selected locations are no longer available. Please refresh and try again."
        );

        return;
    }

    try {

        if (submitTakedownRequestButton) {
            submitTakedownRequestButton.disabled =
                true;
        }

        setTakedownMessage("");

        /*
            Prevent duplicate active requests.
        */

        const duplicate =
            await hasActiveTakedownRequest(
                validLocationIds
            );

        if (duplicate) {

            setTakedownMessage(
                "You already have an active takedown request involving one or more of these locations."
            );

            return;
        }

        /*
            Refresh the user's account information.
        */

        const userSnapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                )
            );

        const userData =
            userSnapshot.exists()
                ? userSnapshot.data()
                : {};

        const username =
            String(
                currentUsername ||
                userData.username ||
                "Unknown user"
            );

        /*
            Create the request.
        */

        await addDoc(
            collection(
                db,
                "takedownRequests"
            ),
            {
                userId:
                    currentUser.uid,

                username:
                    username,

                email:
                    currentUser.email || "",

                locationIds:
                    validLocationIds,

                reason:
                    reason,

                status:
                    "pending",

                submittedAt:
                    serverTimestamp(),

                reviewedAt:
                    null,

                reviewedBy:
                    null,

                reviewReason:
                    null
            }
        );

        /*
            Reset the form after successful submission.
        */

        selectedTakedownLocationIds = [];

        if (takedownReason) {
            takedownReason.value = "";
        }

        if (takedownReasonCount) {
            takedownReasonCount.textContent =
                `0 / ${TAKEDOWN_MAX_REASON_LENGTH}`;
        }

        renderSelectedTakedownLocations();
        renderTakedownLocationResults();

        closeModal(
            "takedownRequestModal"
        );

        toast(
            "Takedown request submitted for review."
        );

        /*
            Refresh request history.
        */

        await loadMyTakedownRequests(false);

    } catch (error) {

        console.error(
            "Unable to submit takedown request:",
            error
        );

        setTakedownMessage(
            "Unable to submit the request. Please try again."
        );

    } finally {

        if (submitTakedownRequestButton) {

            submitTakedownRequestButton.disabled =
                false;
        }
    }
}


/* =========================================================
   USER REQUEST HISTORY
========================================================= */

async function loadMyTakedownRequests(openRequestsModal = true) {

    if (!currentUser) {

        if (myTakedownRequestsContent) {

            myTakedownRequestsContent.innerHTML = `
                <div class="empty-state">
                    Sign in to view your takedown requests.
                </div>
            `;
        }

        return;
    }

    if (myTakedownRequestsContent) {

        myTakedownRequestsContent.innerHTML = `
            <div class="empty-state">
                Loading your requests...
            </div>
        `;
    }

    if (openRequestsModal) {

        openModal(
            "takedownRequestsModal"
        );
    }

    try {

        const snapshot =
            await getDocs(
                query(
                    collection(
                        db,
                        "takedownRequests"
                    ),
                    where(
                        "userId",
                        "==",
                        currentUser.uid
                    )
                )
            );

const requests =
    snapshot.docs
        .map(requestDoc => ({
            id:
                requestDoc.id,

            ...requestDoc.data()
        }))
        .filter(request => {

            /*
             * User-cleared requests should no longer
             * appear in their request history.
             */

            return request.clearedByUser !== true;
        });

        requests.sort(
            (a, b) => {

                const aTime =
                    a.submittedAt?.toMillis?.() ||
                    0;

                const bTime =
                    b.submittedAt?.toMillis?.() ||
                    0;

                return bTime - aTime;
            }
        );

        if (!requests.length) {

            myTakedownRequestsContent.innerHTML = `
                <div class="explore-empty">

                    <div class="explore-empty-title">
                        No takedown requests
                    </div>

                    <div class="explore-empty-text">
                        Requests you submit will appear here.
                    </div>

                </div>
            `;

            return;
        }

        myTakedownRequestsContent.innerHTML =
            requests.map(request => {

                const status =
                    request.status ||
                    "pending";

                const locationNames =
                    Array.isArray(
                        request.locationIds
                    )
                        ? request.locationIds.map(
                            id =>
                                getLocationName(id)
                          )
                        : [];

                return `
                    <div
                        class="takedown-request-card"
                    >

                        <div class="takedown-request-header">

                            <div>

                                <div class="takedown-request-title">
                                    Takedown request
                                </div>

                                <div class="takedown-request-date">
                                    Submitted
                                    ${escapeHtml(
                                        formatTakedownDate(
                                            request.submittedAt
                                        )
                                    )}
                                </div>

                            </div>

                            <span
                                class="takedown-status ${escapeHtml(
                                    status
                                )}"
                            >
                                ${escapeHtml(
                                    getTakedownStatusLabel(
                                        status
                                    )
                                )}
                            </span>

                        </div>


                        <div class="takedown-request-locations">

                            ${
                                locationNames
                                    .map(
                                        name => `
                                            <div>
                                                ${escapeHtml(name)}
                                            </div>
                                        `
                                    )
                                    .join("")
                            }

                        </div>


                        <div class="takedown-request-reason">

                            <strong>
                                Reason submitted
                            </strong>

                            <p>
                                ${escapeHtml(
                                    request.reason || ""
                                )}
                            </p>

                        </div>


                        ${
                            status === "declined" &&
                            request.reviewReason
                                ? `
                                    <div class="takedown-review-note">

                                        <strong>
                                            Review note
                                        </strong>

                                        <p>
                                            ${escapeHtml(
                                                request.reviewReason
                                            )}
                                        </p>

                                    </div>
                                `
                                : ""
                        }


                        ${
                            status === "approved"
                                ? `
                                    <div class="takedown-review-note">

                                        <strong>
                                            Review note
                                        </strong>

                                        <p>
                                            ${escapeHtml(
                                                request.reviewReason ||
                                                "Request approved by PlingifyPlug administration."
                                            )}
                                        </p>

                                    </div>
                                `
                                : ""
                        }

                        ${ 
    ["approved", "declined"].includes(status)
        ? `
            <div class="admin-report-actions">

                <button
                    type="button"
                    class="button"
                    data-clear-takedown-user="${escapeHtml(
                        request.id
                    )}"
                >
                    Clear request
                </button>

            </div>
        `
        : ""
}

                    </div>
                `;

            }).join("");

    } catch (error) {

        console.error(
            "Unable to load takedown requests:",
            error
        );

        if (myTakedownRequestsContent) {

            myTakedownRequestsContent.innerHTML = `
                <div class="empty-state">
                    Unable to load your takedown requests.
                </div>
            `;
        }
    }
}


/* =========================================================
   OPEN REPORTS
========================================================= */

async function openReportsModal() {

    if (!isExplorerAdmin()) {

        toast(
            "You do not have permission to access Reports."
        );

        return;
    }

    openModal(
        "reportsModal"
    );

    adminReportsSection =
        "takedowns";

    adminTakedownStatus =
        "pending";

    document
        .querySelectorAll(".reports-tab")
        .forEach(tab => {

            tab.classList.toggle(
                "active",
                tab.id ===
                    "reportsTakedownsTab"
            );
        });

    document
        .querySelectorAll(".reports-status-tab")
        .forEach(tab => {

            tab.classList.toggle(
                "active",
                tab.dataset.reportStatus ===
                    "pending"
            );
        });

    const takedownsPanel =
        document.getElementById(
            "reportsTakedownsPanel"
        );

    const additionsPanel =
        document.getElementById(
            "reportsAdditionsPanel"
        );

    if (takedownsPanel) {
        takedownsPanel.style.display =
            "block";
    }

    if (additionsPanel) {
        additionsPanel.style.display =
            "none";
    }

    await loadAdminTakedownRequests();
}


/* =========================================================
   ADMIN LOAD TAKEDOWNS
========================================================= */

async function loadAdminTakedownRequests() {

    if (!isExplorerAdmin()) {
        return;
    }

    if (adminTakedownRequests) {

        adminTakedownRequests.innerHTML = `
            <div class="empty-state">
                Loading reports...
            </div>
        `;
    }

    try {

        /*
            Admin is allowed to read all requests.
        */

        const snapshot =
            await getDocs(
                collection(
                    db,
                    "takedownRequests"
                )
            );

        let requests =
            snapshot.docs
                .map(requestDoc => ({
                    id:
                        requestDoc.id,

                    ...requestDoc.data()
                }))
.filter(request => {

    const status =
        request.status ||
        "pending";

    /*
     * Admin-cleared requests should no longer
     * appear in the admin reports.
     */

    if (
        request.adminCleared === true
    ) {
        return false;
    }

    return status === adminTakedownStatus;
});

        requests.sort(
            (a, b) => {

                const aTime =
                    a.submittedAt?.toMillis?.() ||
                    0;

                const bTime =
                    b.submittedAt?.toMillis?.() ||
                    0;

                return bTime - aTime;
            }
        );

        if (!requests.length) {

            if (adminTakedownRequests) {

                adminTakedownRequests.innerHTML = `
                    <div class="explore-empty">

                        <div class="explore-empty-title">
                            No ${
                                adminTakedownStatus
                            } takedown requests
                        </div>

                        <div class="explore-empty-text">
                            Requests in this status will appear here.
                        </div>

                    </div>
                `;
            }

            return;
        }

        adminTakedownRequests.innerHTML =
            requests.map(request =>
                renderAdminTakedownRequest(
                    request
                )
            ).join("");

    } catch (error) {

        console.error(
            "Unable to load admin takedown requests:",
            error
        );

        if (adminTakedownRequests) {

            adminTakedownRequests.innerHTML = `
                <div class="empty-state">
                    Unable to load reports.
                </div>
            `;
        }
    }
}


/* =========================================================
   ADMIN REQUEST CARD
========================================================= */

function renderAdminTakedownRequest(request) {

    const locationNames =
        Array.isArray(
            request.locationIds
        )
            ? request.locationIds.map(
                id =>
                    getLocationName(id)
              )
            : [];

    const status =
        request.status ||
        "pending";

const actions =
    status === "pending"
        ? `
            <div class="admin-report-actions">

                <button
                    type="button"
                    class="button"
                    data-takedown-decline="${escapeHtml(
                        request.id
                    )}"
                >
                    Decline
                </button>

                <button
                    type="button"
                    class="button danger"
                    data-takedown-approve="${escapeHtml(
                        request.id
                    )}"
                >
                    Approve & remove
                </button>

            </div>
        `
        : ["approved", "declined"].includes(status)
            ? `
                <div class="admin-report-actions">

                    <button
                        type="button"
                        class="button"
                        data-clear-takedown-admin="${escapeHtml(
                            request.id
                        )}"
                    >
                        Clear request
                    </button>

                </div>
            `
            : "";

    return `
        <article
            class="admin-report-card"
        >

            <div class="admin-report-card-header">

                <div>

                    <div class="admin-report-title">
                        Takedown request
                    </div>

                    <div class="admin-report-subtitle">
                        Submitted by
                        <strong>
                            ${escapeHtml(
                                request.username ||
                                "Unknown user"
                            )}
                        </strong>
                    </div>

                </div>

                <span
                    class="takedown-status ${escapeHtml(
                        status
                    )}"
                >
                    ${escapeHtml(
                        getTakedownStatusLabel(
                            status
                        )
                    )}
                </span>

            </div>


            <div class="admin-report-meta">

                <div>
                    <strong>User ID</strong>

                    <span>
                        ${escapeHtml(
                            request.userId ||
                            "Unknown"
                        )}
                    </span>
                </div>

                <div>
                    <strong>Email</strong>

                    <span>
                        ${escapeHtml(
                            request.email ||
                            "Not available"
                        )}
                    </span>
                </div>

                <div>
                    <strong>Submitted</strong>

                    <span>
                        ${escapeHtml(
                            formatTakedownDate(
                                request.submittedAt
                            )
                        )}
                    </span>
                </div>

            </div>


            <div class="admin-report-section">

                <strong>
                    Locations
                </strong>

                <div class="admin-report-locations">

                    ${
                        locationNames
                            .map(
                                name => `
                                    <div>
                                        ${escapeHtml(name)}
                                    </div>
                                `
                            )
                            .join("")
                    }

                </div>

            </div>


            <div class="admin-report-section">

                <strong>
                    Reason
                </strong>

                <p>
                    ${escapeHtml(
                        request.reason ||
                        "No reason provided."
                    )}
                </p>

            </div>


            ${
                request.reviewReason
                    ? `
                        <div class="admin-report-section">

                            <strong>
                                Admin review note
                            </strong>

                            <p>
                                ${escapeHtml(
                                    request.reviewReason
                                )}
                            </p>

                        </div>
                    `
                    : ""
            }


            ${actions}

        </article>
    `;
}

/* =========================================================
   CREATE USER NOTIFICATION
========================================================= */

async function createTakedownNotification({
    userId,
    type,
    title,
    description
}) {

    if (!userId) {
        throw new Error("Missing notification user ID.");
    }

    await addDoc(
        collection(db, "notifications"),
        {
            userId: userId,

            type: type,

            title: title,

            description: description,

            read: false,

            createdAt: serverTimestamp()
        }
    );
}


/* =========================================================
   APPROVE TAKEDOWN
========================================================= */

async function approveTakedownRequest(requestId) {

    if (!isExplorerAdmin()) {

        toast(
            "You do not have permission to do this."
        );

        return;
    }

    if (!requestId) {

        toast(
            "Invalid takedown request."
        );

        return;
    }

    const confirmed =
        window.confirm(
            "Approve this takedown request?\n\nThe selected locations and their public ratings will be permanently removed from Explorer."
        );

    if (!confirmed) {
        return;
    }

    try {

        const requestRef =
            doc(
                db,
                "takedownRequests",
                requestId
            );

        const requestSnapshot =
            await getDoc(
                requestRef
            );

        if (!requestSnapshot.exists()) {

            toast(
                "This request no longer exists."
            );

            return;
        }

        const request =
            requestSnapshot.data();

        if (
            request.status &&
            request.status !== "pending"
        ) {

            toast(
                "This request has already been reviewed."
            );

            return;
        }

        const locationIds =
            Array.isArray(
                request.locationIds
            )
                ? [
                    ...new Set(
                        request.locationIds
                    )
                  ]
                : [];

        if (!locationIds.length) {

            toast(
                "This request contains no locations."
            );

            return;
        }

        /*
            Delete every requested location
            and its related ratings.
        */

        for (
            const locationId
            of locationIds
        ) {

            await deleteLocationAndRatings(
                locationId
            );
        }

        /*
            Mark the request as approved.

            The request itself is retained as an
            administrative record.
        */

const approvalReason =
    "Request approved by PlingifyPlug administration.";

await updateDoc(
    requestRef,
    {
        status:
            "approved",

        reviewedAt:
            serverTimestamp(),

        reviewedBy:
            currentUser.uid,

        reviewReason:
            approvalReason
    }
);


/* =====================================================
   CREATE APPROVAL NOTIFICATION
===================================================== */

const approvedLocationNames =
    locationIds
        .map(id => getLocationName(id))
        .filter(Boolean);

await createTakedownNotification({

    userId:
        request.userId,

    type:
        "takedown_approved",

    title:
        "Takedown request approved",

    description:
        `Your takedown request for ${
            approvedLocationNames.join(", ")
        } has been approved. ${
            approvalReason
        }`
});


        /* =====================================================
           UPDATE LOCAL USER DATA
        ===================================================== */

        if (
            Array.isArray(
                currentUserSavedLocations
            )
        ) {

            currentUserSavedLocations =
                currentUserSavedLocations.filter(
                    id =>
                        !locationIds.includes(id)
                );
        }


        if (
            Array.isArray(
                currentUserViewedLocations
            )
        ) {

            currentUserViewedLocations =
                currentUserViewedLocations.filter(
                    item => {

                        const id =
                            typeof item === "string"
                                ? item
                                : item?.id;

                        return !locationIds.includes(id);
                    }
                );
        }


        if (
            Array.isArray(
                currentUserExploredLocations
            )
        ) {

            currentUserExploredLocations =
                currentUserExploredLocations.filter(
                    item => {

                        const id =
                            typeof item === "string"
                                ? item
                                : item?.id;

                        return !locationIds.includes(id);
                    }
                );
        }


        if (
            Array.isArray(allLocations)
        ) {

            allLocations =
                allLocations.filter(
                    location =>
                        !locationIds.includes(
                            location.id
                        )
                );
        }


        /*
            Refresh Explorer UI.
        */

        updateUserStats();
        renderLocations();

        /*
            Refresh admin reports.
        */

        await loadAdminTakedownRequests();

        toast(
            "Takedown approved. The selected location(s) have been removed."
        );

    } catch (error) {

        console.error(
            "Unable to approve takedown:",
            error
        );

        toast(
            "Unable to approve this takedown request."
        );
    }
}


/* =========================================================
   DELETE LOCATION + RELATED RATINGS
========================================================= */

async function deleteLocationAndRatings(locationId) {

    if (!isExplorerAdmin()) {

        throw new Error(
            "Only the Explorer administrator can delete locations."
        );
    }

    if (!locationId) {

        throw new Error(
            "Missing location ID."
        );
    }

    /*
        Find all rating documents belonging
        to this location.
    */

    const ratingsQuery =
        query(
            collection(
                db,
                "explorations"
            ),
            where(
                "locationId",
                "==",
                locationId
            )
        );

    const snapshot =
        await getDocs(
            ratingsQuery
        );


    /*
        Delete ratings in batches.

        Firestore supports up to 500 writes in a batch.
        We use 450 to leave some safety room.
    */

    if (!snapshot.empty) {

        let batch =
            writeBatch(db);

        let operationCount = 0;

        for (
            const relatedDoc
            of snapshot.docs
        ) {

            batch.delete(
                relatedDoc.ref
            );

            operationCount++;

            if (operationCount >= 450) {

                await batch.commit();

                batch =
                    writeBatch(db);

                operationCount = 0;
            }
        }

        if (operationCount > 0) {

            await batch.commit();
        }
    }


    /*
        Finally delete the location itself.
    */

    await deleteDoc(
        doc(
            db,
            "locations",
            locationId
        )
    );
}


/* =========================================================
   DECLINE TAKEDOWN
========================================================= */

async function declineTakedownRequest(requestId) {

    if (!isExplorerAdmin()) {

        toast(
            "You do not have permission to do this."
        );

        return;
    }

    if (!requestId) {

        toast(
            "Invalid takedown request."
        );

        return;
    }

    const reason =
        window.prompt(
            "Optional reason for declining this request:"
        );

    /*
        Canceling the prompt should not decline
        the request.
    */

    if (reason === null) {
        return;
    }

    try {

        const requestRef =
            doc(
                db,
                "takedownRequests",
                requestId
            );

        const requestSnapshot =
            await getDoc(
                requestRef
            );

        if (!requestSnapshot.exists()) {

            toast(
                "This request no longer exists."
            );

            return;
        }

        const request =
            requestSnapshot.data();

        if (
            request.status &&
            request.status !== "pending"
        ) {

            toast(
                "This request has already been reviewed."
            );

            return;
        }

        const reviewReason =
            String(
                reason || ""
            ).trim() ||
            "Request declined by PlingifyPlug administration.";

await updateDoc(
    requestRef,
    {
        status:
            "declined",

        reviewedAt:
            serverTimestamp(),

        reviewedBy:
            currentUser.uid,

        reviewReason:
            reviewReason
    }
);


/* =====================================================
   CREATE DECLINE NOTIFICATION
===================================================== */

const declinedLocationNames =
    Array.isArray(request.locationIds)
        ? request.locationIds
            .map(id => getLocationName(id))
            .filter(Boolean)
        : [];

await createTakedownNotification({

    userId:
        request.userId,

    type:
        "takedown_declined",

    title:
        "Takedown request declined",

    description:
        `Your takedown request for ${
            declinedLocationNames.join(", ")
        } has been declined. Reason: ${
            reviewReason
        }`
});

        await loadAdminTakedownRequests();

        toast(
            "Takedown request declined."
        );

    } catch (error) {

        console.error(
            "Unable to decline takedown:",
            error
        );

        toast(
            "Unable to decline this request."
        );
    }
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

if (requestTakedownButton) {

    requestTakedownButton.addEventListener(
        "click",
        openTakedownRequestModal
    );
}


if (takedownRequestsButton) {

    takedownRequestsButton.addEventListener(
        "click",
        () => loadMyTakedownRequests(true)
    );
}


if (reportsButton) {

    reportsButton.addEventListener(
        "click",
        openReportsModal
    );
}


/* =========================================================
   LOCATION SEARCH
========================================================= */

if (takedownLocationSearch) {

    takedownLocationSearch.addEventListener(
        "input",
        () => {

            takedownSearchTerm =
                takedownLocationSearch.value
                    .trim()
                    .toLowerCase();

            renderTakedownLocationResults();
        }
    );
}


/* =========================================================
   REASON COUNTER
========================================================= */

if (takedownReason) {

    takedownReason.addEventListener(
        "input",
        () => {

            if (takedownReasonCount) {

                takedownReasonCount.textContent =
                    `${takedownReason.value.length} / ${TAKEDOWN_MAX_REASON_LENGTH}`;
            }
        }
    );
}


/* =========================================================
   SUBMIT BUTTON
========================================================= */

if (submitTakedownRequestButton) {

    submitTakedownRequestButton.addEventListener(
        "click",
        submitTakedownRequest
    );
}


/* =========================================================
   LOCATION SELECTION EVENTS
========================================================= */

document.addEventListener(
    "click",
    event => {

        const selectButton =
            event.target.closest(
                "[data-takedown-select]"
            );

        if (selectButton) {

            toggleTakedownLocation(
                selectButton.dataset.takedownSelect
            );

            return;
        }


        const removeButton =
            event.target.closest(
                "[data-takedown-remove]"
            );

        if (removeButton) {

            toggleTakedownLocation(
                removeButton.dataset.takedownRemove
            );
        }
    }
);


/* =========================================================
   ADMIN / USER TAKEDOWN REPORT EVENTS
========================================================= */

document.addEventListener(
    "click",
    async event => {

        /* =====================================================
           APPROVE
        ===================================================== */

        const approveButton =
            event.target.closest(
                "[data-takedown-approve]"
            );

        if (approveButton) {

            await approveTakedownRequest(
                approveButton.dataset.takedownApprove
            );

            return;
        }


        /* =====================================================
           DECLINE
        ===================================================== */

        const declineButton =
            event.target.closest(
                "[data-takedown-decline]"
            );

        if (declineButton) {

            await declineTakedownRequest(
                declineButton.dataset.takedownDecline
            );

            return;
        }


        /* =====================================================
           ADMIN CLEAR
        ===================================================== */

        const adminClearButton =
            event.target.closest(
                "[data-clear-takedown-admin]"
            );

        if (adminClearButton) {

            if (!isExplorerAdmin()) {

                toast(
                    "You do not have permission to clear this request."
                );

                return;
            }

            openClearTakedownConfirmation(
                adminClearButton.dataset.clearTakedownAdmin,
                "admin"
            );

            return;
        }


        /* =====================================================
           USER CLEAR
        ===================================================== */

        const userClearButton =
            event.target.closest(
                "[data-clear-takedown-user]"
            );

        if (userClearButton) {

            if (!currentUser) {

                toast(
                    "You must be signed in."
                );

                return;
            }

            openClearTakedownConfirmation(
                userClearButton.dataset.clearTakedownUser,
                "user"
            );

            return;
        }
    }
);


/* =========================================================
   ADMIN REPORT STATUS TABS
========================================================= */

document.addEventListener(
    "click",
    event => {

        const statusButton =
            event.target.closest(
                "[data-report-status]"
            );

        if (!statusButton) {
            return;
        }

        if (!isExplorerAdmin()) {
            return;
        }

        const requestedStatus =
            statusButton.dataset.reportStatus;

        if (
            ![
                "pending",
                "approved",
                "declined"
            ].includes(requestedStatus)
        ) {
            return;
        }

        adminTakedownStatus =
            requestedStatus;

        document
            .querySelectorAll(
                ".reports-status-tab"
            )
            .forEach(button => {

                button.classList.toggle(
                    "active",
                    button === statusButton
                );
            });

        loadAdminTakedownRequests();
    }
);


/* =========================================================
   ADMIN REPORT MAIN TABS
========================================================= */

if (reportsTakedownsTab) {

    reportsTakedownsTab.addEventListener(
        "click",
        () => {

            if (!isExplorerAdmin()) {
                return;
            }

            adminReportsSection =
                "takedowns";

            reportsTakedownsTab.classList.add(
                "active"
            );

            reportsAdditionsTab?.classList.remove(
                "active"
            );

            const takedownsPanel =
                document.getElementById(
                    "reportsTakedownsPanel"
                );

            const additionsPanel =
                document.getElementById(
                    "reportsAdditionsPanel"
                );

            if (takedownsPanel) {
                takedownsPanel.style.display =
                    "block";
            }

            if (additionsPanel) {
                additionsPanel.style.display =
                    "none";
            }

            loadAdminTakedownRequests();
        }
    );
}


if (reportsAdditionsTab) {

    reportsAdditionsTab.addEventListener(
        "click",
        () => {

            if (!isExplorerAdmin()) {
                return;
            }

            adminReportsSection =
                "additions";

            reportsAdditionsTab.classList.add(
                "active"
            );

            reportsTakedownsTab?.classList.remove(
                "active"
            );

            const takedownsPanel =
                document.getElementById(
                    "reportsTakedownsPanel"
                );

            const additionsPanel =
                document.getElementById(
                    "reportsAdditionsPanel"
                );

            if (takedownsPanel) {
                takedownsPanel.style.display =
                    "none";
            }

            if (additionsPanel) {
                additionsPanel.style.display =
                    "block";
            }
        }
    );
}

/* =========================================================
   CLEAR TAKEDOWN REQUEST SYSTEM
========================================================= */

const clearTakedownModal =
    document.getElementById("clearTakedownModal");

const clearTakedownMessage =
    document.getElementById("clearTakedownMessage");

const clearTakedownError =
    document.getElementById("clearTakedownError");

const confirmClearTakedownButton =
    document.getElementById("confirmClearTakedownButton");

let takedownRequestToClear = null;
let takedownClearMode = null;


/* =========================================================
   OPEN CLEAR CONFIRMATION
========================================================= */

function openClearTakedownConfirmation(
    requestId,
    mode = "user"
) {

    if (!requestId) {
        console.error(
            "Cannot clear takedown request: missing request ID."
        );

        return;
    }

    takedownRequestToClear = requestId;
    takedownClearMode = mode;

    clearTakedownError.textContent = "";

    if (mode === "admin") {

        clearTakedownMessage.textContent =
            "Are you sure you want to clear this completed takedown request? It will be permanently removed from the reports section.";

    } else {

        clearTakedownMessage.textContent =
            "Are you sure you want to clear this completed takedown request? It will be permanently removed from your request history.";

    }

    clearTakedownModal.classList.add("open");
}


/* =========================================================
   CONFIRM CLEAR
========================================================= */

/* =========================================================
   CONFIRM CLEAR
========================================================= */

async function confirmClearTakedown() {

    if (!takedownRequestToClear) {
        return;
    }

    const requestId = takedownRequestToClear;
    const mode = takedownClearMode;

    clearTakedownError.textContent = "";

    confirmClearTakedownButton.disabled = true;
    confirmClearTakedownButton.textContent = "Clearing...";

    try {

        const requestRef = doc(
            db,
            "takedownRequests",
            requestId
        );

        const requestSnapshot = await getDoc(
            requestRef
        );

        if (!requestSnapshot.exists()) {

            throw new Error(
                "This request no longer exists."
            );
        }

        const request = requestSnapshot.data();

        /*
         * Only completed requests can be cleared.
         */

        if (
            !["approved", "declined"].includes(
                request.status
            )
        ) {

            throw new Error(
                "Only approved or declined requests can be cleared."
            );
        }


        /*
         * USER CLEAR
         *
         * Only hides the request from the user.
         * It remains visible to administrators.
         */

        if (mode === "user") {

            if (
                request.userId !== currentUser?.uid
            ) {

                throw new Error(
                    "You do not have permission to clear this request."
                );
            }

await updateDoc(
    requestRef,
    {
        clearedByUser: true,
        userClearedAt: serverTimestamp()
    }
);
        }


        /*
         * ADMIN CLEAR
         *
         * Only hides the request from administrators.
         * It remains visible to the user.
         */

        else if (mode === "admin") {

            if (!isExplorerAdmin()) {

                throw new Error(
                    "You do not have permission to clear this request."
                );
            }

            await updateDoc(
                requestRef,
                {
                    adminCleared: true
                }
            );
        }


        /*
         * Close confirmation modal.
         */

        clearTakedownModal.classList.remove("open");

        takedownRequestToClear = null;
        takedownClearMode = null;


        /*
         * Refresh the correct section.
         */

        if (mode === "admin") {

            await loadAdminTakedownRequests();

        } else {

            await loadMyTakedownRequests(false);
        }


        toast(
            "Takedown request cleared."
        );

    } catch (error) {

        console.error(
            "Unable to clear takedown request:",
            error
        );

        clearTakedownError.textContent =
            error.message ||
            "Unable to clear this request. Please try again.";

    } finally {

        confirmClearTakedownButton.disabled = false;

        confirmClearTakedownButton.textContent =
            "Clear request";
    }
}

/* =========================================================
   CONFIRMATION BUTTON
========================================================= */

if (confirmClearTakedownButton) {

    confirmClearTakedownButton.addEventListener(
        "click",
        confirmClearTakedown
    );
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

    userData = userData || currentUserData;

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

    rating: rating

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
// GET REAL COMMUNITY RATING
// ==========================================

async function getRealLocationRating(locationId) {

    try {

        const ratingsQuery =
            query(
                collection(db, "explorations"),
                where(
                    "locationId",
                    "==",
                    locationId
                )
            );

        const snapshot =
            await getDocs(
                ratingsQuery
            );


        const ratings =
            snapshot.docs
                .map(doc => doc.data())
                .filter(
                    item =>
                        typeof item.rating === "number" &&
                        item.rating >= 1 &&
                        item.rating <= 10
                );


        if (!ratings.length) {

            return {
                average: null,
                count: 0
            };

        }


        const total =
            ratings.reduce(
                (sum, item) =>
                    sum + item.rating,
                0
            );


        return {

            average:
                Math.round(
                    (total / ratings.length) * 10
                ) / 10,

            count:
                ratings.length

        };


    } catch (error) {

        console.error(
            "Unable to get real location rating:",
            error
        );


        return {
            average: null,
            count: 0
        };

    }

}

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

    const overallScore =
        document.getElementById(
            "ratingOverallScore"
        );

    const overallCount =
        document.getElementById(
            "ratingOverallCount"
        );


    // ------------------------------------------
    // SET TITLE
    // ------------------------------------------

    if (title) {
        title.textContent =
            location.name ||
            "Location ratings";
    }


    // ------------------------------------------
    // RESET OVERALL RATING
    // ------------------------------------------

    if (overallScore) {
        overallScore.textContent = "—";
    }

    if (overallCount) {
        overallCount.textContent =
            "Based on 0 ratings";
    }


    // ------------------------------------------
    // SHOW LOADING
    // ------------------------------------------

    if (content) {
        content.innerHTML = `
            <div class="explore-empty">

                <div class="explore-empty-title">
                    Loading ratings...
                </div>

            </div>
        `;
    }


    openModal("ratingListModal");


    try {

        // ------------------------------------------
        // LOAD ALL PUBLIC RATINGS
        // ------------------------------------------

        const ratingsQuery =
            query(
                collection(
                    db,
                    "explorations"
                ),
                where(
                    "locationId",
                    "==",
                    locationId
                )
            );


        const snapshot =
            await getDocs(
                ratingsQuery
            );


        // ------------------------------------------
        // ONLY KEEP VALID RATINGS
        // ------------------------------------------

        const ratings =
            snapshot.docs
                .map(
                    documentSnapshot => ({
                        id:
                            documentSnapshot.id,

                        ...documentSnapshot.data()
                    })
                )
                .filter(
                    item =>
                        typeof item.rating === "number" &&
                        item.rating >= 1 &&
                        item.rating <= 10
                );


        // ------------------------------------------
        // NO RATINGS
        // ------------------------------------------

        if (!ratings.length) {

            if (overallScore) {
                overallScore.textContent = "—";
            }

            if (overallCount) {
                overallCount.textContent =
                    "Based on 0 ratings";
            }


            if (content) {

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

            }

            return;
        }


        // ------------------------------------------
        // CALCULATE OVERALL RATING
        // ------------------------------------------

        const totalRating =
            ratings.reduce(
                (total, item) =>
                    total + item.rating,
                0
            );


        const averageRating =
            totalRating / ratings.length;


        // ------------------------------------------
        // DISPLAY OVERALL RATING
        // ------------------------------------------

        if (overallScore) {

            overallScore.textContent =
                averageRating.toFixed(1);

        }


        if (overallCount) {

            overallCount.textContent =
                `Based on ${ratings.length} rating${
                    ratings.length === 1
                        ? ""
                        : "s"
                }`;

        }


        // ------------------------------------------
        // SORT HIGHEST → LOWEST
        // ------------------------------------------

        ratings.sort(
            (a, b) =>
                b.rating - a.rating
        );


        // ------------------------------------------
        // DISPLAY EVERY PERSON WHO RATED IT
        // ------------------------------------------

        if (content) {

            content.innerHTML =
                ratings.map(
                    rating => {

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

                    }
                ).join("");

        }


    } catch (error) {

        console.error(
            "Unable to load ratings:",
            error
        );


        if (overallScore) {
            overallScore.textContent = "—";
        }


        if (overallCount) {
            overallCount.textContent =
                "Unable to load ratings";
        }


        if (content) {

            content.innerHTML = `
                <div class="empty-state">
                    Unable to load ratings.
                </div>
            `;

        }

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
        ==========================================
        DELETE THE PUBLIC RATING RECORD
        ==========================================

        This is important.

        The community ratings modal reads
        from the "explorations" collection.

        If we don't delete the record here,
        the old rating will continue to appear.
    */

const ratingQuery = query(
    collection(db, "explorations"),
    where(
        "userId",
        "==",
        currentUser.uid
    ),
    where(
        "locationId",
        "==",
        locationId
    )
);

const ratingSnapshot =
    await getDocs(ratingQuery);

for (const ratingDoc of ratingSnapshot.docs) {

    await deleteDoc(
        ratingDoc.ref
    );

}


    /*
        ==========================================
        NO RATINGS LEFT
        ==========================================

        If this was the final rating, remove
        ratingAverage and ratingCount entirely.

        This means the location is genuinely
        "not rated" rather than 0.0/10.
    */

    if (currentCount <= 1) {

        await updateDoc(
            locationRef,
            {
                ratingAverage:
                    deleteField(),

                ratingCount:
                    deleteField()
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

            delete localLocation.ratingAverage;
            delete localLocation.ratingCount;

        }


        return;

    }


    /*
        ==========================================
        OTHER RATINGS STILL EXIST
        ==========================================
    */

    const oldTotal =
        currentAverage *
        currentCount;


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

                currentUserData = {};

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

    currentUserData =
        userData;

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

                const accountDetailUsername =
    document.getElementById(
        "accountDetailUsername"
    );

const accountDetailEmail =
    document.getElementById(
        "accountDetailEmail"
    );


if (accountDetailUsername) {

    accountDetailUsername.textContent =
        username;

}


if (accountDetailEmail) {

    accountDetailEmail.textContent =
        email;

}


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

                const accountDetailUsername =
    document.getElementById(
        "accountDetailUsername"
    );

const accountDetailEmail =
    document.getElementById(
        "accountDetailEmail"
    );


if (accountDetailUsername) {

    accountDetailUsername.textContent =
        currentUsername;

}


if (accountDetailEmail) {

    accountDetailEmail.textContent =
        currentUser.email;

}

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



function closeAccountProfileDropdown() {

    if (accountProfileDetails) {

        accountProfileDetails.style.display =
            "none";

    }

    if (accountProfileToggle) {

        accountProfileToggle.setAttribute(
            "aria-expanded",
            "false"
        );

    }

    if (accountProfileArrow) {

        accountProfileArrow.textContent =
            "›";

    }

}

// =========================================================
// SAFETY & LEGAL INFORMATION
// =========================================================

const safetyNotice =
    document.getElementById("safetyNotice");

const safetyAgree =
    document.getElementById("safetyAgree");

const safetyInformationButton =
    document.getElementById(
        "safetyInformationButton"
    );


// =========================================================
// INITIAL SAFETY NOTICE
// =========================================================

if (safetyNotice) {

    // Show the safety notice when the site loads
    safetyNotice.classList.remove("hidden");

}


// =========================================================
// CLOSE SAFETY NOTICE
// =========================================================

if (safetyAgree) {

    safetyAgree.addEventListener(
        "click",
        () => {

            safetyNotice.classList.add("hidden");

        }
    );

}


// =========================================================
// OPEN SAFETY INFORMATION FROM ACCOUNT
// =========================================================

if (safetyInformationButton) {

    safetyInformationButton.addEventListener(
        "click",
        () => {

            if (safetyNotice) {

                safetyNotice.classList.remove(
                    "hidden"
                );

            }

        }
    );

}

/* =========================================================
   PRIVACY & TERMS POPUP
========================================================= */

const privacyButton = document.getElementById("privacyButton");
const termsButton = document.getElementById("termsButton");

const legalModal = document.getElementById("legalModal");
const legalModalTitle = document.getElementById("legalModalTitle");
const legalModalContent = document.getElementById("legalModalContent");
const legalModalClose = document.getElementById("legalModalClose");


/* =========================================================
   OPEN LEGAL MODAL
========================================================= */

function openLegalModal(type) {

    if (!legalModal) return;

    if (type === "privacy") {

        legalModalTitle.textContent = "Privacy Policy";

        legalModalContent.innerHTML = `
            <div class="legal-introduction">

                <span class="legal-label">
                    PRIVACY
                </span>

                <h3>Privacy Policy</h3>

                <p>
                    This Privacy Policy explains how PlingifyPlug
                    ("PlingifyPlug", "we", "us" or "our") collects,
                    uses, stores and protects information when you use
                    PlingifyPlug Explorer ("Explorer" or "the Service").
                </p>

                <p class="legal-updated">
                    <strong>Last updated:</strong> 19 August 2026
                </p>

            </div>


            <h3>1. Information We Collect</h3>

            <p>
                Depending on how you use Explorer, we may process
                information associated with your account and use of
                the Service.
            </p>

            <ul>
                <li>Email address associated with your account.</li>
                <li>Account identifier and authentication information.</li>
                <li>Username or display information where applicable.</li>
                <li>Account creation date.</li>
                <li>Saved locations.</li>
                <li>Explored locations.</li>
                <li>Recently viewed locations.</li>
                <li>Ratings and reviews you submit.</li>
                <li>Other information you voluntarily submit.</li>
                <li>Information required for account security.</li>
                <li>Technical information required for the Service to operate.</li>
            </ul>


            <h3>2. Account Statistics and Progress</h3>

            <p>
                Explorer may provide account statistics and progress
                information to you.
            </p>

            <p>
                Depending on the features available, your account may
                display your account creation date, explored locations,
                saved locations, recently viewed locations, ratings
                and other progress information.
            </p>

            <p>
                These statistics are provided as account features and
                may be stored in association with your account.
            </p>


            <h3>3. Saved, Explored and Recently Viewed Locations</h3>

            <p>
                Explorer may allow you to save locations, mark locations
                as explored and view locations that you have recently
                accessed.
            </p>

            <p>
                This information may be stored against your account so
                that Explorer can provide these features and display
                your personal progress.
            </p>

            <p>
                A saved, explored or recently viewed status does not
                represent ownership, permission, verification or
                endorsement of a location.
            </p>


            <h3>4. Ratings and Reviews</h3>

            <p>
                Explorer may allow users to submit ratings, reviews and
                other contributions.
            </p>

            <p>
                Information submitted through these features may be
                stored and processed so that the relevant Explorer
                features can operate.
            </p>

            <p>
                Contributions may be associated with your account and
                may be displayed to other users where the relevant
                feature is designed to display them.
            </p>


            <h3>5. How We Use Information</h3>

            <p>
                Information may be used to:
            </p>

            <ul>
                <li>Create and manage accounts.</li>
                <li>Authenticate users.</li>
                <li>Provide Explorer features.</li>
                <li>Display account statistics and progress.</li>
                <li>Store saved, explored and recently viewed locations.</li>
                <li>Store and display ratings and reviews.</li>
                <li>Maintain and improve Explorer.</li>
                <li>Prevent spam, abuse and fraud.</li>
                <li>Protect the security of the Service.</li>
                <li>Investigate suspected violations of our Terms.</li>
                <li>Enforce reasonable account restrictions.</li>
                <li>Comply with applicable legal requirements.</li>
            </ul>


            <h3>6. Firebase</h3>

            <p>
                Explorer uses Firebase services provided by Google for
                functionality such as user authentication and database
                storage.
            </p>

            <p>
                Information processed through Firebase may be subject
                to Google's applicable privacy practices, security
                measures and terms.
            </p>


            <h3>7. Maps and Location Information</h3>

            <p>
                Explorer uses mapping and location-related services
                to provide its map and location discovery features.
            </p>

            <p>
                Location information may be supplied by PlingifyPlug,
                users, third-party providers or other sources.
            </p>

            <p>
                We do not guarantee that map information, coordinates,
                descriptions, photographs, tags or other location
                information are accurate, complete or current.
            </p>


            <h3>8. Information Sharing</h3>

            <p>
                PlingifyPlug does not sell your personal information as
                a general business practice.
            </p>

            <p>
                Information may be processed by service providers where
                reasonably necessary to operate Explorer, including
                authentication, database, hosting, security and other
                technical services.
            </p>

            <p>
                Information may also be disclosed where reasonably
                necessary to comply with law, respond to lawful requests,
                prevent fraud, investigate abuse or protect PlingifyPlug,
                Explorer, users or third parties.
            </p>


            <h3>9. Account Deletion</h3>

            <p>
                Explorer may provide account deletion controls.
                Where available, you may use those controls to delete
                your account.
            </p>

            <p>
                Some information may be retained where reasonably
                necessary for security, fraud prevention, dispute
                resolution, legal compliance or other lawful purposes.
            </p>


            <h3>10. Security</h3>

            <p>
                We take reasonable measures to protect information
                processed by Explorer.
            </p>

            <p>
                However, no website, database, authentication system or
                internet transmission can guarantee absolute security.
            </p>


            <h3>11. Your Data Protection Rights</h3>

            <p>
                Depending on the circumstances and applicable law, you
                may have rights relating to your personal information,
                including rights of access, correction, deletion,
                restriction, objection and data portability.
            </p>

            <p>
                These rights may be subject to applicable legal
                conditions and exceptions.
            </p>


            <h3>12. Changes to This Privacy Policy</h3>

            <p>
                This Privacy Policy may be updated when Explorer,
                its features, our data processing practices or applicable
                requirements change.
            </p>

            <p>
                Updated versions will be made available through Explorer.
            </p>
        `;

    }


    if (type === "terms") {

        legalModalTitle.textContent = "Terms of Service";

        legalModalContent.innerHTML = `
            <div class="legal-introduction">

                <span class="legal-label">
                    TERMS
                </span>

                <h3>Terms of Service</h3>

                <p>
                    These Terms of Service govern your use of
                    PlingifyPlug Explorer.
                </p>

                <p>
                    By accessing or using Explorer, you agree to comply
                    with these Terms and applicable laws.
                </p>

                <p class="legal-updated">
                    <strong>Last updated:</strong> 19 August 2026
                </p>

            </div>


            <h3>1. Purpose of Explorer</h3>

            <p>
                Explorer is an informational mapping and location
                discovery service.
            </p>

            <p>
                Explorer may display information about abandoned,
                historical, unusual or otherwise notable locations.
            </p>

            <p>
                Information is provided for informational purposes only.
                We do not guarantee that information is accurate,
                complete, current or suitable for any particular purpose.
            </p>


            <h3>2. No Permission to Enter Property</h3>

            <p>
                A location appearing on Explorer does not give you
                permission to enter, access, climb, cross, occupy,
                investigate or otherwise interact with that property.
            </p>

            <p>
                You are responsible for determining whether you have
                lawful permission to access any location.
            </p>

            <p>
                You must respect property owners, occupiers, security
                restrictions, closures, signs, barriers and applicable
                laws.
            </p>


            <h3>3. Explorer Does Not Encourage Trespassing</h3>

            <p>
                PlingifyPlug does not encourage, authorise, promote or
                endorse trespassing, unlawful entry, vandalism, theft,
                property damage, interference with security systems or
                other unlawful conduct.
            </p>

            <p>
                Explorer must not be interpreted as an invitation,
                instruction or permission to enter any location.
            </p>


            <h3>4. Safety Disclaimer</h3>

            <p>
                Locations shown on Explorer may contain hazards or
                dangerous conditions that are not visible from the
                information provided on the site.
            </p>

            <p>
                A location may contain structural hazards, unstable
                surfaces, hazardous materials, water hazards, traffic,
                animals, security systems or other dangers.
            </p>

            <p>
                PlingifyPlug does not guarantee that any location is
                safe, accessible, abandoned, unoccupied, legal to enter
                or free from hazards.
            </p>

            <p>
                Users are responsible for making their own safety and
                legal decisions and should not rely solely on Explorer's
                information.
            </p>


            <h3>5. Location Accuracy</h3>

            <p>
                Location information, coordinates, descriptions,
                photographs, tags, ratings and other information may be
                inaccurate, incomplete, outdated or incorrect.
            </p>

            <p>
                Ownership, access conditions, security, hazards and
                legal restrictions may change at any time.
            </p>


            <h3>6. User Accounts</h3>

            <p>
                Some Explorer features require an account.
            </p>

            <p>
                You are responsible for maintaining reasonable security
                over your account and for activity carried out through
                it.
            </p>

            <p>
                Accounts must not be created or used for fraudulent,
                abusive, unlawful or malicious purposes.
            </p>


            <h3>7. Account Statistics and Progress</h3>

            <p>
                Explorer may provide account statistics including your
                account creation date, number of explored locations,
                saved locations, recently viewed locations and other
                progress information.
            </p>

            <p>
                These statistics are features of the Service and may
                depend on information successfully stored by Explorer.
            </p>


            <h3>8. Ratings and Reviews</h3>

            <p>
                Ratings and reviews must be truthful, relevant and
                submitted in good faith.
            </p>

            <p>
                You must not submit spam, fraudulent ratings,
                deliberately misleading information, harassment,
                threats or unlawful material.
            </p>

            <p>
                You must not manipulate Explorer's rating systems or
                attempt to artificially influence ratings.
            </p>

            <p>
                PlingifyPlug may remove, restrict or moderate
                contributions where reasonably necessary to protect
                Explorer and its users.
            </p>


            <h3>9. User Contributions</h3>

            <p>
                By submitting content to Explorer, you confirm that you
                have the necessary rights or permission to submit that
                content.
            </p>

            <p>
                You must not knowingly submit content that infringes
                another person's intellectual property, privacy or
                other legal rights.
            </p>

            <p>
                You grant PlingifyPlug a non-exclusive, worldwide,
                royalty-free licence to host, store, reproduce, display
                and use submitted content as reasonably necessary to
                operate and improve Explorer.
            </p>


            <h3>10. Prohibited Behaviour</h3>

            <p>
                You must not use Explorer to:
            </p>

            <ul>
                <li>Commit or encourage unlawful activity.</li>
                <li>Encourage trespassing or unauthorised entry.</li>
                <li>Damage, vandalise or steal property.</li>
                <li>Interfere with security systems.</li>
                <li>Harass, threaten or abuse other users.</li>
                <li>Submit fraudulent or deliberately misleading information.</li>
                <li>Manipulate ratings or site statistics.</li>
                <li>Send spam or malicious content.</li>
                <li>Attempt unauthorised access to accounts or systems.</li>
                <li>Disrupt, overload or attack the Service.</li>
                <li>Bypass security or moderation systems.</li>
                <li>Use another person's account without permission.</li>
                <li>Use automated systems to abuse or overload Explorer.</li>
            </ul>


            <h3>11. Account Suspension, Disabling and Bans</h3>

            <p>
                PlingifyPlug reserves the right, where reasonably
                necessary and permitted by applicable law, to remove
                content, restrict features, disable accounts, suspend
                accounts or permanently ban accounts.
            </p>

            <p>
                This may be done for reasonable and legitimate reasons,
                including but not limited to:
            </p>

            <ul>
                <li>Violation of these Terms.</li>
                <li>Suspected unlawful activity.</li>
                <li>Fraud or attempted fraud.</li>
                <li>Spam or platform abuse.</li>
                <li>Harassment or abusive behaviour.</li>
                <li>Malicious activity.</li>
                <li>Attempts to compromise Explorer's security.</li>
                <li>Attempts to bypass an existing restriction or ban.</li>
                <li>Manipulation of ratings or site systems.</li>
                <li>Inappropriate or prohibited content.</li>
                <li>Conduct that creates a significant risk to users.</li>
                <li>Other reasonable steps necessary to protect PlingifyPlug,
                    Explorer, users or third parties.</li>
            </ul>

            <p>
                Where appropriate and reasonably practicable,
                PlingifyPlug may provide information about the reason
                for an account restriction.
            </p>

            <p>
                However, security-sensitive information may not be
                disclosed where doing so could undermine security,
                moderation or abuse-prevention systems.
            </p>

            <p>
                PlingifyPlug may take action without prior notice where
                immediate action is reasonably necessary to protect
                Explorer, its users, third parties or legal interests.
            </p>


            <h3>12. Ban Evasion</h3>

            <p>
                If your account has been suspended or permanently banned,
                you must not attempt to bypass the restriction by
                creating or using another account where doing so would
                violate the restriction.
            </p>


            <h3>13. Service Availability</h3>

            <p>
                We aim to keep Explorer available and functioning, but
                we do not guarantee uninterrupted or error-free
                availability.
            </p>

            <p>
                Explorer may be unavailable due to maintenance,
                technical problems, security incidents, third-party
                service failures or circumstances outside our reasonable
                control.
            </p>


            <h3>14. Third-Party Services</h3>

            <p>
                Explorer may depend on third-party services including
                Firebase, mapping providers, hosting providers and
                other technical services.
            </p>

            <p>
                PlingifyPlug is not responsible for outages, failures,
                changes or restrictions imposed by third-party services
                outside our reasonable control.
            </p>


            <h3>15. Intellectual Property</h3>

            <p>
                Unless otherwise stated, the Explorer website,
                interface, branding, software, original graphics,
                written material and other original site content are
                owned by or licensed to PlingifyPlug.
            </p>

            <p>
                You must not copy, reproduce, redistribute, modify,
                reverse engineer or commercially exploit protected
                Explorer material except where permitted by law or with
                appropriate permission.
            </p>


            <h3>16. No Guarantee of Information</h3>

            <p>
                Explorer is provided on an informational basis.
            </p>

            <p>
                To the fullest extent permitted by applicable law,
                PlingifyPlug does not guarantee the accuracy,
                completeness, reliability, availability or suitability
                of location information, ratings, descriptions, maps or
                user-generated content.
            </p>


            <h3>17. Limitation of Responsibility</h3>

            <p>
                To the fullest extent permitted by applicable law,
                PlingifyPlug will not be responsible for losses or
                consequences arising from reliance on inaccurate,
                incomplete, outdated or user-submitted information.
            </p>

            <p>
                Nothing in these Terms excludes or limits liability where
                such exclusion or limitation would be unlawful.
            </p>


            <h3>18. Changes to Explorer</h3>

            <p>
                PlingifyPlug may add, remove, modify, suspend or
                discontinue features of Explorer where reasonably
                necessary.
            </p>


            <h3>19. Changes to These Terms</h3>

            <p>
                These Terms may be updated as Explorer develops,
                features change, security requirements change or
                applicable laws change.
            </p>

            <p>
                Updated Terms will be made available through Explorer.
            </p>

            <p>
                Continued use of Explorer after updated Terms take
                effect constitutes acceptance of the updated Terms to
                the extent permitted by applicable law.
            </p>


            <h3>20. Governing Law</h3>

            <p>
                These Terms are intended to operate subject to applicable
                law in the United Kingdom.
            </p>

            <p>
                Nothing in these Terms removes or limits rights that
                cannot lawfully be excluded.
            </p>
        `;

    }


    legalModal.classList.add("open");

    document.body.classList.add("modal-open");

    legalModal.setAttribute(
        "aria-hidden",
        "false"
    );

}


/* =========================================================
   CLOSE LEGAL MODAL
========================================================= */

function closeLegalModal() {

    if (!legalModal) return;

    legalModal.classList.remove("open");

    document.body.classList.remove("modal-open");

    legalModal.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* =========================================================
   PRIVACY BUTTON
========================================================= */

if (privacyButton) {

    privacyButton.addEventListener(
        "click",
        () => openLegalModal("privacy")
    );

}


/* =========================================================
   TERMS BUTTON
========================================================= */

if (termsButton) {

    termsButton.addEventListener(
        "click",
        () => openLegalModal("terms")
    );

}


/* =========================================================
   CLOSE BUTTON
========================================================= */

if (legalModalClose) {

    legalModalClose.addEventListener(
        "click",
        closeLegalModal
    );

}


/* =========================================================
   BACKDROP CLOSE
========================================================= */

if (legalModal) {

    legalModal.addEventListener(
        "click",
        (event) => {

            if (event.target === legalModal) {

                closeLegalModal();

            }

        }
    );

}


/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape" &&
            legalModal &&
            legalModal.classList.contains("open")
        ) {

            closeLegalModal();

        }

    }
);
