(function () {
  function detectLocale() {
    try {
      var params = new URLSearchParams(window.location.search);
      var forced = params.get("lang");
      if (forced === "ko" || forced === "en") {
        localStorage.setItem("dotori-lang", forced);
        return forced;
      }
      var stored = localStorage.getItem("dotori-lang");
      if (stored === "ko" || stored === "en") {
        return stored;
      }
    } catch (error) {
    }

    var languages = [];
    if (Array.isArray(navigator.languages)) {
      languages = navigator.languages.slice();
    } else if (navigator.language) {
      languages = [navigator.language];
    }
    var timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (error) {
    }

    var looksKorean = languages.some(function (value) {
      return String(value || "").toLowerCase().indexOf("ko") === 0;
    });
    if (looksKorean || timezone === "Asia/Seoul") {
      return "ko";
    }
    return "en";
  }

  function applyMessages(messages) {
    if (!messages) {
      return;
    }

    if (messages.meta) {
      if (messages.meta.title) {
        document.title = messages.meta.title;
      }
      var description = document.querySelector('meta[name="description"]');
      if (description && messages.meta.description) {
        description.setAttribute("content", messages.meta.description);
      }
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && messages.meta.ogTitle) {
        ogTitle.setAttribute("content", messages.meta.ogTitle);
      }
      var ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription && messages.meta.ogDescription) {
        ogDescription.setAttribute("content", messages.meta.ogDescription);
      }
      var twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle && messages.meta.twitterTitle) {
        twitterTitle.setAttribute("content", messages.meta.twitterTitle);
      }
      var twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (twitterDescription && messages.meta.twitterDescription) {
        twitterDescription.setAttribute("content", messages.meta.twitterDescription);
      }
    }

    if (messages.text) {
      Object.keys(messages.text).forEach(function (key) {
        document.querySelectorAll('[data-i18n="' + key + '"]').forEach(function (node) {
          node.textContent = messages.text[key];
        });
      });
    }

    if (messages.html) {
      Object.keys(messages.html).forEach(function (key) {
        document.querySelectorAll('[data-i18n-html="' + key + '"]').forEach(function (node) {
          node.innerHTML = messages.html[key];
        });
      });
    }

    if (messages.placeholder) {
      Object.keys(messages.placeholder).forEach(function (key) {
        document.querySelectorAll('[data-i18n-placeholder="' + key + '"]').forEach(function (node) {
          node.setAttribute("placeholder", messages.placeholder[key]);
        });
      });
    }

    if (messages.values) {
      Object.keys(messages.values).forEach(function (group) {
        var valueMap = messages.values[group] || {};
        document.querySelectorAll('[data-i18n-value="' + group + '"]').forEach(function (node) {
          var current = String(node.textContent || "").trim();
          if (Object.prototype.hasOwnProperty.call(valueMap, current)) {
            node.textContent = valueMap[current];
          }
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var locale = detectLocale();
    document.documentElement.lang = locale;
    var bundle = window.DOTORI_I18N || {};
    applyMessages(bundle[locale] || bundle.ko || {});
  });
})();
