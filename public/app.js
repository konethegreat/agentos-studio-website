// Download targets and release metadata. No cookies, no storage, no tracking.
(function () {
  var platforms = {
    windows: { flavor: "windows", label: "Windows" },
    macos: { flavor: "macos-arm64", label: "macOS" },
    linux: { flavor: "linux-appimage", label: "Linux" }
  };

  function detectOS() {
    var ua = navigator.userAgent || "";
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/win/i.test(platform) || /Windows NT/i.test(ua)) return "windows";
    if (/mac/i.test(platform) || /Mac OS X/i.test(ua)) return "macos";
    if (/linux/i.test(platform) || (/Linux/i.test(ua) && !/Android/i.test(ua))) return "linux";
    return null;
  }

  function formatSize(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) return "";
    var mb = bytes / (1024 * 1024);
    if (mb < 1) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
  }

  function formatDate(iso) {
    if (!iso || isNaN(Date.parse(iso))) return null;
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  }

  var os = detectOS();
  if (os) {
    var platform = platforms[os];
    Array.prototype.forEach.call(document.querySelectorAll("[data-download]"), function (link) {
      link.href = "/download/" + platform.flavor;
      link.textContent = "Download for " + platform.label;
    });
    var card = document.querySelector('.platform[data-os="' + os + '"]');
    if (card) card.classList.add("is-recommended");
  }

  if (document.querySelector("[data-size]")) {
    fetch("/api/releases", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("release lookup failed");
        return response.json();
      })
      .then(function (manifest) {
        Array.prototype.forEach.call(document.querySelectorAll(".js-version"), function (node) {
          node.textContent = manifest.version;
        });
        var dateText = formatDate(manifest.publishedAt);
        Array.prototype.forEach.call(document.querySelectorAll(".js-date"), function (node) {
          if (dateText) node.textContent = dateText;
          if (manifest.publishedAt) node.setAttribute("datetime", manifest.publishedAt);
        });
        Array.prototype.forEach.call(document.querySelectorAll("[data-size]"), function (node) {
          var asset = manifest.assets && manifest.assets[node.getAttribute("data-size")];
          var size = asset ? formatSize(asset.size) : "";
          if (size) node.textContent = size;
        });
      })
      .catch(function () {
        // The links still resolve server-side; keep the static version and no sizes.
      });
  }
})();
