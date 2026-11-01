import './style.css';
import { getSessionUser, loadSession, clearSession, isAuthenticated } from './state/session.js';
import { getStoredTheme, applyTheme } from './state/theme.js';
import { pushHash, replaceHash, clearHash, goBack, initRouter } from './router.js';
import { initSocket, disconnectSocket } from './services/socket.js';
import { renderAuth } from './views/authView.js';
import { renderOnboarding } from './views/onboardingView.js';
import { renderHome } from './views/homeView.js';
import { renderProfile } from './views/profileView.js';
import { renderPostDetail } from './views/postDetailView.js';
import { renderMessages } from './views/messagesView.js';
import { renderChatInfo } from './views/chatInfoView.js';
import { renderResetPassword } from './views/resetPasswordView.js';
import { renderEmailVerify } from './views/emailVerifyView.js';
import { renderRandomConnect } from './views/randomConnectView.js';
import { renderRandomTextChat } from './views/randomTextChatView.js';
import { renderRandomVideoChat } from './views/randomVideoChatView.js';
import { renderSavedView } from './views/savedView.js';

const app = document.querySelector('#app');

/**
 * Central application view orchestrator.
 */
function navigate(viewName, params = {}) {
  const user = getSessionUser();

  // Route guard: Non-authenticated users must be shown the auth screen
  // Exception: reset-password and verify-email are public deep-link flows
  const publicViews = ['auth', 'resetPassword', 'verifyEmail'];
  if (!user && !publicViews.includes(viewName)) {
    clearHash();
    renderAuth(app, {
      onAuthSuccess: (authedUser, isNewSignup) => {
        if (isNewSignup) {
          navigate('onboarding', { step: 1 });
        } else {
          clearHash();
          navigate('home');
        }
      },
    });
    return;
  }

  switch (viewName) {
    case 'auth': {
      clearHash();
      renderAuth(app, {
        onAuthSuccess: (authedUser, isNewSignup) => {
          if (isNewSignup) {
            navigate('onboarding', { step: 1 });
          } else {
            clearHash();
            navigate('home');
          }
        },
      });
      break;
    }

    case 'onboarding': {
      const step = params.step || 1;
      pushHash(`#/onboarding/${step}`);
      renderOnboarding(app, step, {
        onNavigate: (nextStep) => navigate('onboarding', { step: nextStep }),
        onFinish: (openComposer = false) => {
          clearHash();
          navigate('home', { openComposer });
        },
      });
      break;
    }

    case 'profile': {
      const username = params.username || user?.username;
      if (params.replaceHistory) {
        replaceHash(`#/profile/${encodeURIComponent(username || '')}`);
      } else if (params.push !== false) {
        pushHash(`#/profile/${encodeURIComponent(username || '')}`);
      }
      renderProfile(app, username, {
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onGoBack: () => goBack(() => { clearHash(); navigate('home'); }),
      });
      break;
    }

    case 'postDetail': {
      const postId = params.postId;
      if (params.push !== false) {
        pushHash(`#/post/${postId}`);
      }
      renderPostDetail(app, postId, {
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onGoBack: () => goBack(() => { clearHash(); navigate('home'); }),
      });
      break;
    }

    case 'messages': {
      const convId = params.conversationId;
      if (params.push !== false) {
        pushHash(convId ? `#/messages/${convId}` : '#/messages');
      }
      renderMessages(app, {
        initialConversationId: convId,
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onGoBack: () => goBack(() => { clearHash(); navigate('home'); }),
      });
      break;
    }

    case 'chatInfo': {
      const targetUserId = params.targetUserId || params.userId;
      const convId = params.conversationId;
      if (params.push !== false) {
        pushHash(convId ? `#/messages/info/${targetUserId}/${convId}` : `#/messages/info/${targetUserId}`);
      }
      renderChatInfo(app, {
        targetUserId,
        conversationId: convId,
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onGoBack: () => goBack(() => {
          if (convId) navigate('messages', { conversationId: convId });
          else navigate('messages');
        }),
      });
      break;
    }

    case 'resetPassword': {
      const { token } = params;
      replaceHash(`#/reset-password/${token}`);
      renderResetPassword(app, token, {
        onSuccess: (mode) => {
          clearHash();
          // mode === 'forgot' means user wants to re-request a link
          navigate('auth');
        },
      });
      break;
    }

    case 'verifyEmail': {
      const { token: vToken } = params;
      replaceHash(`#/verify-email/${vToken}`);
      renderEmailVerify(app, vToken, {
        onSuccess: () => {
          clearHash();
          if (isAuthenticated()) {
            navigate('home');
          } else {
            navigate('auth');
          }
        },
      });
      break;
    }

    case 'random-connect': {
      pushHash('#/random-connect');
      renderRandomConnect(app, {
        autoMatchMode: params.autoMatchMode,
        onNavigate: (route, routeParams) => navigate(route, routeParams),
      });
      break;
    }

    case 'randomTextChat': {
      pushHash('#/random-chat');
      renderRandomTextChat(app, {
        sessionId: params.sessionId || params.matchId,
        strangerTempName: params.strangerTempName,
        myTempName: params.myTempName,
        onNavigate: (route, routeParams) => navigate(route, routeParams),
      });
      break;
    }

    case 'randomVideoChat': {
      pushHash('#/random-video');
      renderRandomVideoChat(app, {
        sessionId: params.sessionId || params.matchId,
        strangerTempName: params.strangerTempName,
        myTempName: params.myTempName,
        onNavigate: (route, routeParams) => navigate(route, routeParams),
      });
      break;
    }

    case 'saved': {
      pushHash('#/saved');
      renderSavedView(app, {
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onLogout: () => {
          disconnectSocket();
          navigate('auth');
        },
      });
      break;
    }

    case 'home':
    default: {
      if (location.hash && location.hash !== '#/home' && location.hash !== '#/') {
        clearHash();
      }
      renderHome(app, {
        openComposer: Boolean(params.openComposer),
        onNavigate: (route, routeParams) => navigate(route, routeParams),
        onLogout: () => {
          disconnectSocket();
          clearSession();
          clearHash();
          navigate('auth');
        },
      });
      break;
    }
  }
}

/**
 * Handle incoming routes parsed from URL hash.
 */
function handleRoute(route) {
  // Public flows — allow without auth
  if (route.name === 'resetPassword') {
    navigate('resetPassword', { token: route.params.token, push: false });
    return;
  }
  if (route.name === 'verifyEmail') {
    navigate('verifyEmail', { token: route.params.token, push: false });
    return;
  }

  if (!isAuthenticated()) {
    navigate('auth');
    return;
  }

  switch (route.name) {
    case 'randomTextChat': {
      // Restore from sessionStorage if browser was refreshed
      const savedRc = JSON.parse(sessionStorage.getItem('velove_active_rc_session') || '{}');
      if (savedRc.sessionId) {
        navigate('randomTextChat', {
          sessionId: savedRc.sessionId,
          strangerTempName: savedRc.strangerTempName,
          myTempName: savedRc.myTempName,
          push: false,
        });
      } else {
        navigate('random-connect', { push: false });
      }
      break;
    }
    case 'randomVideoChat': {
      // Restore from sessionStorage if browser was refreshed
      const savedRc = JSON.parse(sessionStorage.getItem('velove_active_rc_session') || '{}');
      if (savedRc.sessionId) {
        navigate('randomVideoChat', {
          sessionId: savedRc.sessionId,
          strangerTempName: savedRc.strangerTempName,
          myTempName: savedRc.myTempName,
          push: false,
        });
      } else {
        navigate('random-connect', { push: false });
      }
      break;
    }
    case 'random-connect':
      navigate('random-connect', { push: false });
      break;
    case 'saved':
      navigate('saved', { push: false });
      break;
    case 'messages':
      navigate('messages', { conversationId: route.params.conversationId, push: false });
      break;
    case 'chatInfo':
      navigate('chatInfo', {
        targetUserId: route.params.userId,
        conversationId: route.params.conversationId,
        push: false,
      });
      break;
    case 'postDetail':
      navigate('postDetail', { postId: route.params.postId, push: false });
      break;
    case 'profile':
      navigate('profile', { username: route.params.username, push: false });
      break;
    case 'onboarding':
      navigate('onboarding', { step: route.params.step });
      break;
    case 'home':
    default:
      navigate('home', { push: false });
      break;
  }
}

// Initialize Router and wire window hashchange/popstate events
const triggerRoute = initRouter(handleRoute);

// Bootstrap Application
loadSession();
// Apply persisted light/dark preference before first paint of any view
applyTheme(getStoredTheme());
// Always trigger the route first — handleRoute and navigate() handle public flows
// (reset-password, verify-email) correctly even without auth.
triggerRoute();
if (isAuthenticated()) {
  initSocket();
}
