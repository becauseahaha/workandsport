const counters = document.querySelectorAll('.js-animate-number');
let hasRun = false;

const animateCount = (el, target) => {
    let start = 0;
    const duration = 1000; // in ms
    const startTime = performance.now();
    const digits = target.toString().length;

    const update = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(progress * target);
        el.textContent = String(current).padStart(digits, '0');
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = String(target).padStart(digits, '0'); // Ensure exact final value
        }
    };

    requestAnimationFrame(update);
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !hasRun) {
            counters.forEach(counter => {
                const target = parseInt(counter.getAttribute('data-target'), 10);
                animateCount(counter, target);
            });
            hasRun = true;
            observer.disconnect(); // Remove if you want it to animate again on scroll
        }
    });
}, {
    threshold: 0.5
});

counters.forEach(counter => observer.observe(counter));