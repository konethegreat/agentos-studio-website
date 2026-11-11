// Site behaviour: OS detection, release metadata and the interactive patterns.
// No cookies, no storage, no tracking. Every feature degrades to plain HTML without it.
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  function each(selector, fn, scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll(selector), fn);
  }

  // ---------------------------------------------------------------------------
  // Operating system detection
  // ---------------------------------------------------------------------------

  var PLATFORMS = {
    windows: { flavor: "windows", label: "Windows", file: "setup .exe" },
    macos: { flavor: "macos-arm64", label: "macOS", file: "Apple Silicon .dmg" },
    linux: { flavor: "linux-appimage", label: "Linux", file: "AppImage" }
  };

  function detectOS() {
    var ua = navigator.userAgent || "";
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/android|iphone|ipad|ipod/i.test(ua)) return null;
    if (/win/i.test(platform) || /Windows NT/i.test(ua)) return "windows";
    if (/mac/i.test(platform) || /Mac OS X/i.test(ua)) return "macos";
    if (/linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
    return null;
  }

  var os = detectOS();
  var current = os ? PLATFORMS[os] : null;

  if (current) {
    each("[data-download]", function (link) {
      link.href = "/download/" + current.flavor;
      var label = link.querySelector("[data-download-label]") || link;
      label.textContent = "Download for " + current.label;
    });
    each("[data-os-name]", function (node) {
      node.textContent = current.label;
    });
    each('.platform[data-os="' + os + '"], .os-card[data-os="' + os + '"]', function (card) {
      card.classList.add("is-recommended");
    });
  } else {
    each("[data-os-only]", function (node) {
      node.hidden = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Operating system switch. Blocks marked data-for="windows" (or several,
  // space separated) show only for the chosen system. Without JS every block
  // shows, each with its own heading.
  // ---------------------------------------------------------------------------

  var pickers = document.querySelectorAll("[data-pick]");
  if (pickers.length) {
    function chooseOS(name) {
      each("[data-pick]", function (button) {
        var on = button.getAttribute("data-pick") === name;
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
      each("[data-for]", function (block) {
        var list = block.getAttribute("data-for").split(/\s+/);
        block.hidden = list.indexOf(name) === -1;
      });
      each("[data-chosen-os]", function (node) {
        node.textContent = PLATFORMS[name] ? PLATFORMS[name].label : name;
      });
    }
    each("[data-os-switch]", function (bar) {
      bar.hidden = false;
    });
    each("[data-pick]", function (button) {
      if (os && button.getAttribute("data-pick") === os) button.classList.add("is-detected");
      button.addEventListener("click", function () {
        chooseOS(button.getAttribute("data-pick"));
      });
    });
    chooseOS(os || "windows");
  }

  // ---------------------------------------------------------------------------
  // Release metadata from /api/releases
  // ---------------------------------------------------------------------------

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

  if (document.querySelector("[data-size], .js-version, [data-file]")) {
    fetch("/api/releases", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("release lookup failed");
        return response.json();
      })
      .then(function (manifest) {
        each(".js-version", function (node) {
          node.textContent = manifest.version;
        });
        var dateText = formatDate(manifest.publishedAt);
        each(".js-date", function (node) {
          if (dateText) node.textContent = dateText;
          if (manifest.publishedAt) node.setAttribute("datetime", manifest.publishedAt);
        });
        var assets = manifest.assets || {};
        each("[data-size]", function (node) {
          var key = node.getAttribute("data-size");
          if (key === "auto") key = current ? current.flavor : "";
          var size = assets[key] ? formatSize(assets[key].size) : "";
          if (size) node.textContent = size;
        });
        each("[data-file]", function (node) {
          var key = node.getAttribute("data-file");
          if (key === "auto") key = current ? current.flavor : "";
          if (assets[key] && assets[key].name) node.textContent = assets[key].name;
        });
      })
      .catch(function () {
        // The download links resolve on the server; the page keeps its static text.
      });
  }

  // ---------------------------------------------------------------------------
  // Reveal on scroll
  // ---------------------------------------------------------------------------

  var revealables = document.querySelectorAll("[data-reveal]");
  if (revealables.length) {
    if (!("IntersectionObserver" in window) || reduceMotion.matches) {
      each("[data-reveal]", function (node) {
        node.classList.add("is-in");
      });
    } else {
      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      each("[data-reveal]", function (node) {
        revealObserver.observe(node);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Number Ticker (Magic UI, MIT), ported from Motion springs to a damped
  // requestAnimationFrame loop. Reduced motion shows the final value at once.
  // ---------------------------------------------------------------------------

  function runTicker(node) {
    var target = Number(node.getAttribute("data-ticker"));
    if (!isFinite(target)) return;
    var format = new Intl.NumberFormat("en-US");
    if (reduceMotion.matches) {
      node.textContent = format.format(target);
      return;
    }
    var value = 0;
    var velocity = 0;
    var last = performance.now();
    function step(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Spring with stiffness 100 and damping 60 over unit mass, as in the original.
      var force = 100 * (target - value) - 60 * velocity * 0.35;
      velocity += force * dt;
      value += velocity * dt;
      if (Math.abs(target - value) < 0.01 && Math.abs(velocity) < 0.05) {
        node.textContent = format.format(target);
        return;
      }
      node.textContent = format.format(Math.max(0, Math.round(value)));
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var tickers = document.querySelectorAll("[data-ticker]");
  if (tickers.length) {
    if (!("IntersectionObserver" in window)) {
      each("[data-ticker]", function (node) {
        node.textContent = node.getAttribute("data-ticker");
      });
    } else {
      each("[data-ticker]", function (node) {
        if (!reduceMotion.matches) node.textContent = "0";
      });
      var tickerObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            tickerObserver.unobserve(entry.target);
            runTicker(entry.target);
          });
        },
        { threshold: 0.6 }
      );
      each("[data-ticker]", function (node) {
        tickerObserver.observe(node);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Spotlight Glow Card (UI Vault, MIT): pointer position into CSS variables.
  // ---------------------------------------------------------------------------

  each(".spotlight-card", function (card) {
    card.addEventListener("pointermove", function (event) {
      if (event.pointerType === "touch") return;
      var rect = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", event.clientX - rect.left + "px");
      card.style.setProperty("--spot-y", event.clientY - rect.top + "px");
    });
  });

  // ---------------------------------------------------------------------------
  // App window tilt in the hero, fine pointers only.
  // ---------------------------------------------------------------------------

  each("[data-tilt]", function (stage) {
    var frame = stage.querySelector(".app-window");
    if (!frame) return;
    stage.addEventListener("pointermove", function (event) {
      if (!finePointer.matches || reduceMotion.matches) return;
      var rect = stage.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;
      frame.style.setProperty("--tilt-y", (x * 14 - 4).toFixed(2) + "deg");
      frame.style.setProperty("--tilt-x", (-y * 10 + 2).toFixed(2) + "deg");
    });
    stage.addEventListener("pointerleave", function () {
      frame.style.removeProperty("--tilt-y");
      frame.style.removeProperty("--tilt-x");
    });
  });

  // ---------------------------------------------------------------------------
  // Editorial Image Accordion (UI Vault, MIT): a real tab pattern.
  // ---------------------------------------------------------------------------

  each("[data-eia]", function (container) {
    var tabs = Array.prototype.slice.call(container.querySelectorAll(".eia__tab"));
    var index = container.querySelector(".eia__index");
    var title = container.querySelector(".eia__title");
    var text = container.querySelector(".eia__text");
    if (!tabs.length) return;

    function select(i, focus) {
      tabs.forEach(function (tab, j) {
        var on = i === j;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      });
      if (index) index.textContent = String(i + 1).padStart(2, "0") + " / " + String(tabs.length).padStart(2, "0");
      if (title) title.textContent = tabs[i].getAttribute("data-title") || "";
      if (text) text.textContent = tabs[i].getAttribute("data-text") || "";
      if (focus) tabs[i].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        select(i, false);
      });
      tab.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "mouse") select(i, false);
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (i + 1) % tabs.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });

    select(0, false);
  });

  // ---------------------------------------------------------------------------
  // Copy buttons for commands in the setup guide.
  // ---------------------------------------------------------------------------

  each("[data-copy]", function (button) {
    button.hidden = false;
    button.addEventListener("click", function () {
      var source = document.getElementById(button.getAttribute("data-copy"));
      if (!source || !navigator.clipboard) return;
      navigator.clipboard.writeText(source.textContent.trim()).then(
        function () {
          var before = button.textContent;
          button.textContent = "Copied";
          setTimeout(function () {
            button.textContent = before;
          }, 1600);
        },
        function () {
          button.textContent = "Select and copy";
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Setup guide: step checkboxes, progress and the active table of contents
  // entry. Progress lives in this tab only; nothing is stored.
  // ---------------------------------------------------------------------------

  var steps = Array.prototype.slice.call(document.querySelectorAll(".step[id]"));
  if (steps.length) {
    var bar = document.querySelector(".progress-bar i");
    var label = document.querySelector(".progress-text");
    var tocLinks = {};
    each(".guide-toc a[href^='#']", function (link) {
      tocLinks[link.getAttribute("href").slice(1)] = link;
    });

    function refresh() {
      var done = 0;
      steps.forEach(function (step) {
        var box = step.querySelector(".step-done input");
        var isDone = !!(box && box.checked);
        step.classList.toggle("is-done", isDone);
        if (tocLinks[step.id]) tocLinks[step.id].classList.toggle("is-done", isDone);
        if (isDone) done += 1;
      });
      var pct = Math.round((done / steps.length) * 100);
      if (bar) bar.style.width = pct + "%";
      if (label) label.textContent = done + " of " + steps.length + " steps done";
    }

    each(".step-done input", function (box) {
      box.addEventListener("change", refresh);
    });
    refresh();

    if ("IntersectionObserver" in window) {
      var activeObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            Object.keys(tocLinks).forEach(function (id) {
              tocLinks[id].classList.toggle("is-active", id === entry.target.id);
            });
          });
        },
        { rootMargin: "-30% 0px -60% 0px" }
      );
      steps.forEach(function (step) {
        activeObserver.observe(step);
      });
    }
  }
})();
