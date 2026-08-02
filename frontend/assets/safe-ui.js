(function initAquaUI(global) {
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const showToast = (message, type = 'success', duration = 3500) => {
        const toast = document.createElement('div');
        const icon = document.createElement('i');
        const text = document.createElement('span');
        const iconName = type === 'success'
            ? 'fa-check-circle'
            : type === 'error'
                ? 'fa-exclamation-circle'
                : 'fa-info-circle';

        toast.className = `toast ${['error', 'info', 'warning'].includes(type) ? type : ''}`;
        icon.className = `fas ${iconName}`;
        text.textContent = String(message ?? '');
        toast.append(icon, text);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    };

    const requestJson = async (input, init) => {
        let response;
        try {
            response = await fetch(input, init);
        } catch (error) {
            throw new Error('No hay conexión con AquaControl');
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
            window.location.href = '/';
            throw new Error('La sesión expiró');
        }
        if (response.status === 403) {
            document.dispatchEvent(new CustomEvent('aquacontrol:access-denied'));
        }
        if (!response.ok) {
            throw new Error(data.error || 'No fue posible completar la solicitud');
        }
        return data;
    };

    const ROLE_ROUTES = Object.freeze({
        admin: '/admin/',
        repartidor: '/repartidor/',
        cliente: '/cliente/app.html',
        rh: '/equipo/',
        jefe_planta: '/equipo/'
    });
    const ROLE_LABELS = Object.freeze({
        admin: 'Administrador',
        repartidor: 'Repartidor',
        cliente: 'Cliente',
        rh: 'Recursos Humanos',
        jefe_planta: 'Jefe de planta'
    });
    let activeSessionGuard = null;

    const showSessionChanged = (expectedRoles, activeUser) => {
        if (document.querySelector('.aq-session-overlay')) return;
        const expectedLabel = expectedRoles.map((role) => ROLE_LABELS[role] || role).join(' o ');
        const activeLabel = ROLE_LABELS[activeUser.rol] || activeUser.rol;
        const activeRoute = ROLE_ROUTES[activeUser.rol] || '/';
        const overlay = document.createElement('div');
        const dialog = document.createElement('section');
        const brand = document.createElement('div');
        const logo = document.createElement('img');
        const brandName = document.createElement('strong');
        const title = document.createElement('h2');
        const message = document.createElement('p');
        const help = document.createElement('p');
        const button = document.createElement('button');

        overlay.className = 'aq-session-overlay';
        dialog.className = 'aq-session-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'aqSessionTitle');
        brand.className = 'aq-session-brand';
        logo.src = '/assets/brand/aquacontrol-mark.svg';
        logo.alt = '';
        brandName.textContent = 'AquaControl';
        title.id = 'aqSessionTitle';
        title.textContent = 'La sesión del navegador cambió';
        message.textContent = `Esta pestaña estaba abierta para ${expectedLabel}, pero la sesión activa ahora pertenece a ${activeLabel}: ${activeUser.nombre}.`;
        help.textContent = 'Las pestañas del mismo navegador comparten sesión. Para probar varios perfiles a la vez, usa perfiles de navegador separados.';
        help.className = 'aq-session-help';
        button.type = 'button';
        button.innerHTML = `<i class="fas fa-arrow-right"></i> Abrir panel de ${activeLabel}`;
        button.addEventListener('click', () => window.location.assign(activeRoute));
        brand.append(logo, brandName);
        dialog.append(brand, title, message, help, button);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        button.focus();
        window.setTimeout(() => {
            if (document.body.contains(overlay)) window.location.assign(activeRoute);
        }, 12000);
    };

    const startSessionGuard = (expectedRoles, expectedUserId = null) => {
        const roles = Array.isArray(expectedRoles) ? [...expectedRoles] : [expectedRoles];
        const key = `${roles.sort().join(',')}:${expectedUserId || ''}`;
        if (activeSessionGuard?.key === key) return activeSessionGuard.stop;
        if (activeSessionGuard) activeSessionGuard.stop();

        let stopped = false;
        let checking = false;
        let interval = null;
        const check = async () => {
            if (stopped || checking) return;
            checking = true;
            try {
                const response = await fetch('/api/auth/me', { cache: 'no-store' });
                if (response.status === 401) {
                    window.location.assign('/');
                    return;
                }
                if (!response.ok) return;
                const data = await response.json();
                const activeUser = data.user;
                const roleChanged = !roles.includes(activeUser?.rol);
                const userChanged = expectedUserId && Number(activeUser?.id) !== Number(expectedUserId);
                if (roleChanged || userChanged) {
                    stop();
                    document.dispatchEvent(new CustomEvent('aquacontrol:session-changed', { detail: activeUser }));
                    showSessionChanged(roles, activeUser);
                }
            } catch (error) {
                // El monitor de conexión informa por separado los fallos de red.
            } finally {
                checking = false;
            }
        };
        const onVisibility = () => { if (!document.hidden) check(); };
        const stop = () => {
            stopped = true;
            if (interval) window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('aquacontrol:access-denied', check);
        };

        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('aquacontrol:access-denied', check);
        interval = window.setInterval(check, 12000);
        activeSessionGuard = { key, stop };
        check();
        return stop;
    };

    let connectionMonitorStarted = false;
    const startConnectionMonitor = () => {
        if (connectionMonitorStarted) return;
        connectionMonitorStarted = true;

        const banner = document.createElement('div');
        banner.className = 'aq-connection-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML = '<i class="fas fa-link-slash"></i><span>Sin conexión al servidor. Reintentando...</span>';
        document.body.appendChild(banner);

        let previousState = null;
        let checking = false;
        const render = (connected) => {
            document.body.dataset.serverConnection = connected ? 'online' : 'offline';
            banner.classList.toggle('visible', !connected);
            if (connected && previousState === false) {
                document.dispatchEvent(new CustomEvent('aquacontrol:reconnected'));
            }
            previousState = connected;
        };

        const check = async () => {
            if (checking) return;
            checking = true;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
                const response = await fetch('/api/health', {
                    cache: 'no-store',
                    signal: controller.signal
                });
                render(response.ok);
            } catch (error) {
                render(false);
            } finally {
                clearTimeout(timeout);
                checking = false;
            }
        };

        window.addEventListener('online', check);
        window.addEventListener('offline', () => render(false));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) check();
        });
        check();
        setInterval(check, 20000);
    };

    global.AquaUI = Object.freeze({ escapeHtml, showToast, requestJson, startConnectionMonitor, startSessionGuard });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startConnectionMonitor, { once: true });
    } else {
        startConnectionMonitor();
    }
})(window);
