(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // ---------------------------------------------------- resizable contents ----
  // The two columns are driven by --left on .book. Dragging, arrow keys and
  // double-click all write the same variable, and the choice is kept per reader.
  // The chapter column is never allowed to collapse.
  var book = document.querySelector(".book");
  if (book) {
    var LIMITS = [220, 480];
    var DEFAULT_LEFT = 296;
    var MIN_READING = 420;
    var KEY = "notebook-panes";

    var read = function () {
      return parseInt(getComputedStyle(book).getPropertyValue("--left"), 10) || DEFAULT_LEFT;
    };

    var save = function () {
      try { localStorage.setItem(KEY, JSON.stringify({ left: read() })); } catch (_) {}
    };

    // Keep the chapter readable no matter how far the handle is dragged: whatever
    // room is left after the reading minimum is the real ceiling.
    var clamp = function (px) {
      var room = book.clientWidth - MIN_READING;
      var hi = Math.min(LIMITS[1], Math.max(LIMITS[0], room));
      return Math.round(Math.min(hi, Math.max(LIMITS[0], px)));
    };

    var setPane = function (px) {
      book.style.setProperty("--left", clamp(px) + "px");
    };

    try {
      var stored = JSON.parse(localStorage.getItem(KEY) || "null");
      if (stored && stored.left) setPane(stored.left);
    } catch (_) {}

    all(".gutter").forEach(function (g) {
      g.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.preventDefault();
        var startX = e.clientX, startW = read();
        g.setPointerCapture(e.pointerId);
        g.classList.add("dragging");
        document.body.classList.add("resizing");

        var move = function (ev) { setPane(startW + (ev.clientX - startX)); };
        var up = function () {
          g.classList.remove("dragging");
          document.body.classList.remove("resizing");
          g.removeEventListener("pointermove", move);
          g.removeEventListener("pointerup", up);
          g.removeEventListener("pointercancel", up);
          save();
        };
        g.addEventListener("pointermove", move);
        g.addEventListener("pointerup", up);
        g.addEventListener("pointercancel", up);
      });

      g.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") setPane(read() - step);
        else if (e.key === "ArrowRight") setPane(read() + step);
        else if (e.key === "Home" || e.key === "Enter") setPane(DEFAULT_LEFT);
        else return;
        e.preventDefault();
        save();
      });

      g.addEventListener("dblclick", function () { setPane(DEFAULT_LEFT); save(); });
    });

    // A window that shrank below the current width has to give the chapter its
    // minimum back.
    window.addEventListener("resize", function () { setPane(read()); });
  }

  // -------------------------------------------------------------- drawer ----
  // Below the breakpoint the contents is a drawer. Above it the button is hidden
  // and none of this ever runs, so there is one sidebar rather than two.
  var side = $("sidebar"), scrim = $("scrim");
  if (side) {
    var setNav = function (open) {
      document.body.classList.toggle("nav-open", open);
      if (scrim) scrim.hidden = !open;
      var btn = $("menu-open");
      if (btn) btn.setAttribute("aria-expanded", String(open));
      if (open) side.scrollTop = Math.max(0, side.scrollTop);
    };
    if ($("menu-open")) $("menu-open").addEventListener("click", function () {
      setNav(!document.body.classList.contains("nav-open"));
    });
    if ($("menu-close")) $("menu-close").addEventListener("click", function () { setNav(false); });
    if (scrim) scrim.addEventListener("click", function () { setNav(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) setNav(false);
    });
    // Following a link inside the drawer should leave it behind, not return to a
    // page with the contents still covering it.
    side.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });
  }

  // ---------------------------------------------------- progress and marks ----
  // Where the reader has been, kept in their own browser. Nothing here is sent
  // anywhere, and the page is correct without it: the build ships every chapter
  // with an empty dot and a 0/N count, and this fills them in.
  var PKEY = "notebook-progress";

  var state = (function () {
    try {
      var s = JSON.parse(localStorage.getItem(PKEY) || "{}");
      return {
        read: Array.isArray(s.read) ? s.read : [],
        reading: Array.isArray(s.reading) ? s.reading : [],
        marks: Array.isArray(s.marks) ? s.marks : [],
        last: typeof s.last === "string" ? s.last : "",
        lastLabel: typeof s.lastLabel === "string" ? s.lastLabel : ""
      };
    } catch (_) {
      return { read: [], reading: [], marks: [], last: "", lastLabel: "" };
    }
  })();

  var persist = function () {
    try { localStorage.setItem(PKEY, JSON.stringify(state)); } catch (_) {}
  };

  var has = function (list, slug) { return list.indexOf(slug) !== -1; };
  var add = function (list, slug) { if (!has(list, slug)) list.push(slug); };
  var drop = function (list, slug) {
    var i = list.indexOf(slug);
    if (i !== -1) list.splice(i, 1);
  };

  // Which chapters belong to which track. The build emits this on every page,
  // because the shelf has no sidebar to read it out of and its per-track counters
  // have to agree with the ones inside a track.
  var BOOK = (function () {
    var el = $("book-map");
    try { return el ? JSON.parse(el.textContent) : []; } catch (_) { return []; }
  })();

  var meter = function (el, done, total) {
    var bar = el.querySelector(".part-bar i");
    if (bar) bar.style.width = (total ? (done / total) * 100 : 0) + "%";
    var count = el.querySelector(".part-count, .side-count");
    if (count) {
      count.textContent = done + "/" + total + (count.className === "side-count" ? " read" : "");
    }
  };

  var paint = function () {
    all("[data-chapter]").forEach(function (el) {
      if (el.tagName === "MAIN") return;
      var slug = el.dataset.chapter;
      el.classList.toggle("is-read", has(state.read, slug));
      el.classList.toggle("is-reading", !has(state.read, slug) && has(state.reading, slug));
    });
    all(".ch-mark").forEach(function (b) {
      b.setAttribute("aria-pressed", String(has(state.marks, b.dataset.bookmark)));
    });

    BOOK.forEach(function (t) {
      var read = t.chapters.filter(function (s) { return has(state.read, s); }).length;
      all('[data-track="' + t.slug + '"]').forEach(function (el) {
        meter(el, read, t.chapters.length);
      });
    });

    // "Start reading" is only true the first time. After that the honest label is
    // the chapter they stopped in.
    //
    // The label comes from what was stored when they were last in that chapter,
    // not from the DOM: on the shelf the chapter they left off in may not be one
    // of the three titles a card happens to show, and a button that changed its
    // link without changing its text would send them somewhere it did not name.
    var cta = $("start-reading");
    var known = state.last && BOOK.some(function (t) {
      return t.chapters.indexOf(state.last) !== -1;
    });
    if (cta && known && !has(state.read, state.last) && state.lastLabel) {
      cta.href = "/" + state.last + "/";
      cta.querySelector("b").textContent = "Continue reading";
      cta.querySelector("small").textContent = state.lastLabel;
    }
  };

  all(".ch-mark").forEach(function (b) {
    b.addEventListener("click", function () {
      var slug = b.dataset.bookmark;
      if (has(state.marks, slug)) drop(state.marks, slug); else add(state.marks, slug);
      persist();
      paint();
    });
  });

  var here = document.querySelector("main[data-chapter]");
  if (here) {
    var slug = here.dataset.chapter;
    state.last = slug;
    // Recorded here, while the chapter's own heading is on screen, so the shelf
    // can name it later without having the chapter's markup to read.
    var kicker = document.querySelector(".art-head .art-num");
    var h1 = document.querySelector(".art-head h1");
    state.lastLabel = (kicker ? kicker.textContent.replace(/^Chapter\s+/, "") + " · " : "") +
      (h1 ? h1.textContent.trim() : slug);
    if (!has(state.read, slug)) add(state.reading, slug);
    persist();

    var setRead = function (on) {
      if (on) { add(state.read, slug); drop(state.reading, slug); }
      else { drop(state.read, slug); add(state.reading, slug); }
      persist();
      paint();
      var btn = $("mark-read");
      if (btn) {
        btn.setAttribute("aria-pressed", String(on));
        btn.textContent = on ? "Read" : "Mark as read";
      }
    };

    if ($("mark-read")) {
      if (has(state.read, slug)) setRead(true);
      $("mark-read").addEventListener("click", function () {
        setRead(!has(state.read, slug));
      });
    }

    // Reaching the end of a chapter is the ordinary way to finish one; the button
    // is for the reader who disagrees with that.
    var scroller = document.querySelector(".book-main");
    if (scroller) {
      var checking = false;
      scroller.addEventListener("scroll", function () {
        if (checking || has(state.read, slug)) return;
        checking = true;
        requestAnimationFrame(function () {
          checking = false;
          if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 160) {
            setRead(true);
          }
        });
      }, { passive: true });
    }
  }

  paint();

  // -------------------------------------------------------------- search ----
  // One static index, matched here. It is fetched on the first search rather than
  // with the page: a reader who never searches never downloads it.
  var find = $("find");
  if (find) {
    var input = $("find-input"), results = $("find-results");
    var index = null, loading = null, rows = [], cursor = -1, opener = null;

    var load = function () {
      if (index) return Promise.resolve(index);
      if (!loading) {
        loading = fetch("/search.json").then(function (r) { return r.json(); })
          .then(function (data) { index = data; return data; })
          .catch(function () { index = []; return index; });
      }
      return loading;
    };

    var terms = function (q) {
      return q.toLowerCase().split(/\s+/).filter(Boolean);
    };

    // Title hits outrank body hits, and a chapter outranks one of its own sections
    // on an equal score - the broader page is the safer default.
    var score = function (entry, ts) {
      var title = entry.t.toLowerCase(), where = entry.p.toLowerCase(), total = 0;
      for (var i = 0; i < ts.length; i += 1) {
        var t = ts[i], s = 0;
        if (title.indexOf(t) !== -1) s += title.indexOf(t) === 0 ? 12 : 8;
        if (where.indexOf(t) !== -1) s += 3;
        if (entry.b.indexOf(t) !== -1) s += 1;
        if (!s) return 0;
        total += s;
      }
      return total + (entry.k === "chapter" ? 1 : 0);
    };

    var mark = function (text, ts) {
      var frag = document.createDocumentFragment(), rest = text;
      while (rest) {
        var at = -1, len = 0;
        ts.forEach(function (t) {
          var i = rest.toLowerCase().indexOf(t);
          if (i !== -1 && (at === -1 || i < at)) { at = i; len = t.length; }
        });
        if (at === -1) { frag.appendChild(document.createTextNode(rest)); break; }
        if (at) frag.appendChild(document.createTextNode(rest.slice(0, at)));
        var m = document.createElement("mark");
        m.textContent = rest.slice(at, at + len);
        frag.appendChild(m);
        rest = rest.slice(at + len);
      }
      return frag;
    };

    var move = function (delta) {
      if (!rows.length) return;
      cursor = (cursor + delta + rows.length) % rows.length;
      rows.forEach(function (li, i) { li.classList.toggle("on", i === cursor); });
      rows[cursor].scrollIntoView({ block: "nearest" });
    };

    var render = function (q) {
      var ts = terms(q);
      results.replaceChildren();
      rows = [];
      cursor = -1;
      if (!ts.length) {
        var hint = document.createElement("li");
        hint.className = "find-empty";
        hint.textContent = "Type to search every chapter and section.";
        results.appendChild(hint);
        return;
      }
      var hits = (index || []).map(function (e) { return { e: e, s: score(e, ts) }; })
        .filter(function (h) { return h.s > 0; })
        .sort(function (a, b) { return b.s - a.s || a.e.n.localeCompare(b.e.n); })
        .slice(0, 24);

      if (!hits.length) {
        var none = document.createElement("li");
        none.className = "find-empty";
        none.textContent = "Nothing in the book matches “" + q + "”.";
        results.appendChild(none);
        return;
      }

      hits.forEach(function (h, i) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        if (i === 0) { li.classList.add("on"); cursor = 0; }
        var a = document.createElement("a");
        a.href = h.e.u;
        var num = document.createElement("span");
        num.className = "find-kind";
        num.textContent = h.e.k === "chapter" ? h.e.n : h.e.n + "·";
        var title = document.createElement("span");
        title.className = "find-title";
        title.appendChild(mark(h.e.t, ts));
        var where = document.createElement("span");
        where.className = "find-where";
        where.textContent = h.e.p + (h.e.d ? " — " + h.e.d : "");
        a.append(num, title, where);
        li.appendChild(a);
        li.addEventListener("mouseenter", function () {
          rows.forEach(function (r, j) { r.classList.toggle("on", j === i); });
          cursor = i;
        });
        results.appendChild(li);
        rows.push(li);
      });
    };

    var openFind = function () {
      opener = document.activeElement;
      find.hidden = false;
      document.body.classList.add("find-open");
      input.value = "";
      render("");
      input.focus();
      load().then(function () { render(input.value); });
    };

    var closeFind = function () {
      find.hidden = true;
      document.body.classList.remove("find-open");
      if (opener && opener.focus) opener.focus();
    };

    if ($("search-open")) $("search-open").addEventListener("click", openFind);

    input.addEventListener("input", function () { render(input.value); });

    find.addEventListener("click", function (e) {
      if (e.target === find) closeFind();
    });

    document.addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        if (find.hidden) openFind(); else closeFind();
        return;
      }
      // A bare "/" is a search shortcut everywhere except inside something the
      // reader is already typing into.
      if (k === "/" && find.hidden && !/^(input|textarea|select)$/i.test(
          (document.activeElement && document.activeElement.tagName) || "")) {
        e.preventDefault();
        openFind();
        return;
      }
      if (find.hidden) return;
      if (k === "escape") { e.preventDefault(); closeFind(); }
      else if (k === "arrowdown") { e.preventDefault(); move(1); }
      else if (k === "arrowup") { e.preventDefault(); move(-1); }
      else if (k === "enter" && cursor >= 0 && rows[cursor]) {
        e.preventDefault();
        rows[cursor].querySelector("a").click();
      }
    });
  }

  // ---------------------------------------------------- embedded figures ----
  // Each diagram is a standalone 1200px-wide document in an iframe. CSS cannot
  // divide a container width by a fixed pixel width to get the unitless number
  // scale() needs, so the ratio is computed here and written back as --fs. The
  // frame's aspect-ratio already reserves the right space, so setting this causes
  // no layout shift - and with this script absent the frame just scrolls.
  var frames = all(".fig-frame");
  if (frames.length) {
    var STAGE = 1200;
    var fit = function (frame) {
      var box = frame.clientWidth;
      if (!box) return;
      frame.style.setProperty("--fs", Math.min(1, box / STAGE));
    };
    var fitAll = function () { frames.forEach(fit); };
    fitAll();
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (e) { fit(e.target); });
      });
      frames.forEach(function (f) { ro.observe(f); });
    } else {
      window.addEventListener("resize", fitAll);
    }
    // A frame that was lazy-loaded while off screen can report a stale width the
    // first time it paints.
    frames.forEach(function (f) {
      var frame = f.querySelector("iframe");
      if (frame) frame.addEventListener("load", function () { fit(f); });
    });
  }

  // ----------------------------------------------------------- lightbox ----
  // Every diagram is a link to its full-size file, so this only intercepts that
  // link. With JavaScript off, clicking still opens the image.
  var lb = $("lightbox");
  if (lb) {
    var lbImg = $("lightbox-image"), lbCap = $("lightbox-caption"), last = null;

    var close = function () {
      lb.hidden = true;
      document.body.classList.remove("lb-open");
      lbImg.src = "";
      if (last) last.focus();
    };

    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest(".zoom");
      if (!a) return;
      e.preventDefault();
      last = document.activeElement;
      var img = a.querySelector("img");
      var cap = a.closest("figure") && a.closest("figure").querySelector("figcaption");
      lbImg.src = a.getAttribute("href");
      lbImg.alt = img ? img.alt : "";
      lbCap.textContent = (cap && cap.textContent) || a.getAttribute("title") || (img && img.alt) || "";
      lb.hidden = false;
      document.body.classList.add("lb-open");
      lb.querySelector(".lightbox-close").focus();
    });

    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.closest(".lightbox-close")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !lb.hidden) close();
    });
  }

  // -------------------------------------------------------- copy buttons ----
  all(".code-block").forEach(function (block) {
    var code = block.querySelector("code");
    if (!code || !navigator.clipboard) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "copy";
    b.textContent = "Copy";
    b.addEventListener("click", function () {
      navigator.clipboard.writeText(code.textContent).then(function () {
        b.textContent = "Copied";
        b.classList.add("done");
        setTimeout(function () { b.textContent = "Copy"; b.classList.remove("done"); }, 1500);
      });
    });
    block.appendChild(b);
  });

  // ------------------------------------------------ contents highlighting ----
  // The middle column is its own scroll container, so the observer has to use it
  // as the root rather than the viewport.
  var tocLinks = all(".toc a");
  var main = document.querySelector(".book-main");
  if (tocLinks.length && main && "IntersectionObserver" in window) {
    var active = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var next = tocLinks.filter(function (l) {
          return l.hash.slice(1) === entry.target.id;
        })[0];
        if (!next || next === active) return;
        if (active) active.classList.remove("on");
        next.classList.add("on");
        active = next;
      });
    }, { root: main, rootMargin: "0px 0px -75% 0px", threshold: 0 });
    tocLinks.forEach(function (l) {
      var t = document.getElementById(decodeURIComponent(l.hash.slice(1)));
      if (t) io.observe(t);
    });
  }

})();
