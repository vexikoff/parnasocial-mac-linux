function Vizualizator(analyser, targets, isActive) {
    this.analyser = analyser;
    this.targets = targets;
    this.isActive = typeof isActive === 'function' ? isActive : null;
    this.running = false;
    this.rafId = null;
    this.freqData = null;
    this.envBass = 0;
}

Vizualizator.prototype.ensureBuffers = function() {
    if (!this.freqData || this.freqData.length !== this.analyser.frequencyBinCount) {
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
};

Vizualizator.prototype.bassBins = function() {
    var sr = 44100;
    var fft = 1024;

    if (this.analyser.context && typeof this.analyser.context.sampleRate === 'number') {
        sr = this.analyser.context.sampleRate;
    }

    if (typeof this.analyser.fftSize === 'number' && this.analyser.fftSize > 0) {
        fft = this.analyser.fftSize;
    }

    var binHz = sr / fft;
    var bins = Math.round(150 / binHz);

    if (bins < 2) {
        bins = 2;
    }

    if (bins > this.freqData.length) {
        bins = this.freqData.length;
    }

    return bins;
};

Vizualizator.prototype.energyOf = function(from, to) {
    var sum = 0;
    var n = 0;

    for (var i = from; i < to && i < this.freqData.length; i++) {
        sum += this.freqData[i];
        n++;
    }

    if (n === 0) {
        return 0;
    }

    return sum / n / 255;
};

Vizualizator.prototype.start = function() {
    if (this.running) {
        return;
    }

    this.running = true;

    var self = this;

    var loop = function() {
        if (!self.running) {
            return;
        }

        self.update();
        self.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
};

Vizualizator.prototype.stop = function() {
    this.running = false;

    if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    this.reset();
};

Vizualizator.prototype.reset = function() {
    this.envBass = 0;

    for (var i = 0; i < this.targets.length; i++) {
        var el = this.targets[i].el;

        if (el) {
            el.style.transform = '';
        }
    }
};

Vizualizator.prototype.update = function() {
    if (this.isActive && !this.isActive()) {
        this.reset();
        return;
    }

    this.ensureBuffers();
    this.analyser.getByteFrequencyData(this.freqData);

    var bassBins = this.bassBins();
    var bassRaw = this.energyOf(0, bassBins);

    var soft = Math.pow(bassRaw, 0.5);

    var over = bassRaw - 0.3;

    if (over < 0) {
        over = 0;
    }

    var hard = over * over * 5;

    this.envBass = this.envBass * 0.8 + bassRaw * 0.2;

    var trans = bassRaw - this.envBass;

    for (var t = 0; t < this.targets.length; t++) {
        var cfg = this.targets[t];
        var el = cfg.el;

        if (!el) {
            continue;
        }

        if (bassRaw < 0.03 && hard < 0.01) {
            el.style.transform = '';
            continue;
        }

        var lift = -(soft * cfg.lift + hard * cfg.liftPeak);
        var sway = trans * (cfg.sway + hard * cfg.swayPeak) * cfg.dir;
        var rot = trans * (cfg.rotMax + hard * cfg.rotPeak) * cfg.dir;
        var scale = 1 + soft * cfg.scaleMax + hard * cfg.scalePeak;

        el.style.transform = 'translate(' + sway.toFixed(2) + 'px,' + lift.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    }
};