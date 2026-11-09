(() => {
  'use strict';

  const original = 'https://handsnft.fun/';
  const walletDialog = document.getElementById('wallet-dialog');
  const accountDialog = document.getElementById('account-dialog');
  const message = document.getElementById('wallet-status');
  const account = document.getElementById('wallet-account');
  const chain = document.getElementById('wallet-chain');
  const browserWallets = new Map();
  let connectedWallet;
  let pending = false;

  window.addEventListener('eip6963:announceProvider', ({ detail }) => {
    if (typeof detail?.provider?.request === 'function' && typeof detail.info?.rdns === 'string') {
      browserWallets.set(detail.info.rdns.toLowerCase(), detail.provider);
    }
  });

  const knownWallets = {
    MetaMask: ['io.metamask'],
    Phantom: ['app.phantom'],
    Rainbow: ['me.rainbow'],
    'Coinbase Wallet': ['com.coinbase.wallet', 'org.toshi']
  };

  function findWallet(name) {
    for (const key of knownWallets[name] ?? []) {
      if (browserWallets.has(key)) return browserWallets.get(key);
    }
    const injected = window.ethereum;
    const providers = Array.isArray(injected?.providers) ? injected.providers : [injected];
    if (name === 'Phantom' && window.phantom?.ethereum?.request) return window.phantom.ethereum;
    return providers.find(provider => {
      if (typeof provider?.request !== 'function') return false;
      if (name === 'MetaMask') return provider.isMetaMask && !provider.isPhantom && !provider.isCoinbaseWallet && !provider.isRainbow;
      if (name === 'Phantom') return provider.isPhantom;
      if (name === 'Rainbow') return provider.isRainbow;
      return name === 'Coinbase Wallet' && provider.isCoinbaseWallet;
    });
  }

  function setStatus(text, link) {
    message.replaceChildren(document.createTextNode(text));
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = original;
      anchor.textContent = 'Open the original game';
      message.append(document.createTextNode(' '), anchor);
    }
  }

  const validAddress = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);

  function updateAddress(address) {
    account.textContent = address ?? '';
    document.querySelectorAll('[data-wallet-trigger="header"]').forEach(button => {
      button.textContent = address ? address.slice(0, 6) + '…' + address.slice(-4) : 'Connect Wallet';
      button.setAttribute('aria-label', address ? 'Wallet account ' + address : 'Connect Wallet');
    });
    document.querySelectorAll('[data-wallet-trigger="game"]').forEach(button => {
      if (address) button.setAttribute('aria-label', 'Open original game with connected wallet');
      else button.removeAttribute('aria-label');
      button.textContent = address ? 'Open live game' : 'Connect';
    });
  }

  function updateChain(value) {
    chain.textContent = value?.toLowerCase() === '0x4115' ? '0G Mainnet' : 'Select 0G Mainnet in your wallet for Season 10.';
  }

  function disconnect() {
    if (!connectedWallet) return;
    for (const [event, listener] of connectedWallet.listeners) {
      connectedWallet.provider.removeListener?.(event, listener);
    }
    connectedWallet = undefined;
    updateAddress();
    accountDialog.close();
  }

  async function connect(name) {
    if (pending) return;
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const provider = findWallet(name);
    if (!provider) {
      setStatus(name === 'WalletConnect' ?
        'For WalletConnect QR and mobile pairing, use the original game.' :
        name + ' was not detected in this browser. Enable its extension and try again.', true);
      return;
    }

    pending = true;
    setStatus('Approve the connection in ' + name + '.');
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const address = Array.isArray(accounts) && accounts.find(validAddress);
      if (!address) {
        setStatus('No wallet account was shared. Try again.');
        return;
      }

      const listeners = [
        ['accountsChanged', next => {
          const nextAddress = Array.isArray(next) && next.find(validAddress);
          if (nextAddress) updateAddress(nextAddress);
          else disconnect();
        }],
        ['chainChanged', updateChain],
        ['disconnect', disconnect]
      ];
      connectedWallet = { provider, listeners };
      for (const [event, listener] of listeners) provider.on?.(event, listener);
      updateAddress(address);
      chain.textContent = '';
      if (walletDialog.open) walletDialog.close();
      provider.request({ method: 'eth_chainId' }).then(value => {
        if (connectedWallet?.provider === provider) updateChain(value);
      }).catch(() => {});
    } catch (error) {
      setStatus(error?.code === 4001 ? 'Connection was declined.' :
        error?.code === -32002 ? 'A connection request is already open in your wallet.' :
        'Could not connect to ' + name + '. Unlock your wallet and try again.');
    } finally {
      pending = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.walletTrigger) {
      if (connectedWallet && button.dataset.walletTrigger === 'game') {
        window.location.assign(original);
      } else if (connectedWallet) {
        accountDialog.showModal();
      } else {
        setStatus('');
        walletDialog.showModal();
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      }
    }
    if (button.dataset.walletChoice) connect(button.dataset.walletChoice);
    if (button.dataset.walletClose !== undefined) walletDialog.close();
    if (button.dataset.walletDisconnect !== undefined) disconnect();
    if (button.dataset.walletInstall !== undefined) setStatus('Install a browser wallet such as MetaMask or Phantom, or use WalletConnect on the original game.', true);
    if (button.dataset.scrollTop !== undefined) window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  walletDialog.addEventListener('click', event => {
    if (event.target === walletDialog) walletDialog.close();
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
})();
