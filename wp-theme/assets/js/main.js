/**
 * Common Ladder Theme — Main JavaScript
 *
 * Handles: mobile menu, skip-to-content, and progressive enhancements.
 * No jQuery dependency. Vanilla JS only.
 */

(function () {
  'use strict';

  // =========================================================
  // MOBILE MENU
  // =========================================================
  const menuToggle   = document.getElementById('menu-toggle');
  const mobileNav    = document.getElementById('mobile-navigation');
  const siteHeader   = document.querySelector('.site-header');

  if (menuToggle && mobileNav) {
    function openMenu() {
      menuToggle.setAttribute('aria-expanded', 'true');
      mobileNav.classList.add('is-open');
      mobileNav.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      menuToggle.setAttribute('aria-expanded', 'false');
      mobileNav.classList.remove('is-open');
      mobileNav.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function toggleMenu() {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    menuToggle.addEventListener('click', toggleMenu);

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menuToggle.focus();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (
        mobileNav.classList.contains('is-open') &&
        !mobileNav.contains(e.target) &&
        !menuToggle.contains(e.target)
      ) {
        closeMenu();
      }
    });

    // Close when a link is clicked
    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
  }


  // =========================================================
  // STICKY HEADER SHADOW
  // =========================================================
  if (siteHeader) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            siteHeader.classList.add('is-scrolled');
          } else {
            siteHeader.classList.remove('is-scrolled');
          }
        });
      },
      { threshold: 0 }
    );

    // Observe a sentinel element at the top of the page
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:100%;pointer-events:none;';
    document.body.prepend(sentinel);
    observer.observe(sentinel);
  }


  // =========================================================
  // ZIP CODE FORM — basic client-side validation
  // =========================================================
  const heroSearchForm = document.querySelector('.hero__search');

  if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', function (e) {
      const zipInput = heroSearchForm.querySelector('input[name="zip"]');
      if (!zipInput) return;

      const zip = zipInput.value.trim();

      if (!/^\d{5}$/.test(zip)) {
        e.preventDefault();
        zipInput.setAttribute('aria-invalid', 'true');
        zipInput.focus();

        let errorMsg = document.getElementById('zip-error');
        if (!errorMsg) {
          errorMsg = document.createElement('p');
          errorMsg.id = 'zip-error';
          errorMsg.setAttribute('role', 'alert');
          errorMsg.style.cssText = 'color: #c0392b; font-size: 0.875rem; margin-top: 0.5rem; text-align: left; padding-left: 1.25rem;';
          heroSearchForm.after(errorMsg);
        }
        errorMsg.textContent = 'Please enter a valid 5-digit ZIP code.';
      } else {
        zipInput.removeAttribute('aria-invalid');
        const errorMsg = document.getElementById('zip-error');
        if (errorMsg) errorMsg.remove();
      }
    });
  }


  // =========================================================
  // SMOOTH SCROLL FOR ANCHOR LINKS
  // =========================================================
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  });


  // =========================================================
  // LAZY-LOAD IMAGES (polyfill for older browsers)
  // =========================================================
  if ('loading' in HTMLImageElement.prototype === false) {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    if (lazyImages.length && 'IntersectionObserver' in window) {
      const imgObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
            }
            obs.unobserve(img);
          }
        });
      });
      lazyImages.forEach(function (img) {
        imgObserver.observe(img);
      });
    }
  }

})();
