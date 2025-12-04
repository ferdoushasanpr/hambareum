import { useState, useEffect, useCallback } from "react";
import { ABI } from "./contract/contractABI.js";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const COOLDOWN_SECONDS = 30;

const CONTRACT_ABI = ABI;

const formatAddress = (address) =>
  `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

const App = () => {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [lastMessageTime, setLastMessageTime] = useState(0);

  const getContract = useCallback((signerOrProvider) => {
    if (typeof window.ethers === "undefined") {
      console.error(
        "Ethers.js is not loaded. Please ensure it's available in the global scope."
      );
      return null;
    }
    try {
      return new window.ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signerOrProvider
      );
    } catch (e) {
      console.error("Failed to create contract instance:", e);
      return null;
    }
  }, []);

  const fetchAllMessages = useCallback(async () => {
    setError(null);
    try {
      if (
        typeof window.ethereum === "undefined" ||
        typeof window.ethers === "undefined"
      ) {
        setError(
          "MetaMask or Ethers.js not detected. Please install and connect."
        );
        return;
      }

      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const hambaContract = getContract(provider);
      if (!hambaContract) return;

      const allMessages = await hambaContract.getAllMessages();

      const formattedMessages = allMessages
        .map((message) => ({
          sender: message.sender,
          content: message.content,
          timestamp: Number(message.timestamp),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setMessages(formattedMessages);
    } catch (e) {
      console.error("Error fetching messages:", e);
      setError("Failed to fetch messages. Check console for details.");
    }
  }, [getContract]);

  const connectWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof window.ethereum === "undefined") {
        setError(
          "MetaMask is not installed. Please install it to use this app."
        );
        setLoading(false);
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts.length > 0) {
        setCurrentAccount(accounts[0]);
      } else {
        setError("No authorized accounts found.");
      }
    } catch (e) {
      console.error("Connection failed:", e);
      setError("Wallet connection failed. See console.");
    } finally {
      setLoading(false);
    }
  };

  const sendHambaMessage = async (e) => {
    e.preventDefault();
    if (!currentAccount) {
      setError("Please connect your wallet first.");
      return;
    }
    if (newMessage.trim().length === 0 || newMessage.trim().length > 280) {
      setError("Message must be between 1 and 280 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const hambaContract = getContract(signer);

      if (!hambaContract) return;

      const tx = await hambaContract.sendMessage(newMessage.trim());
      await tx.wait();

      setNewMessage("");
      setSuccessMessage("Message sent successfully! Refreshing history...");

      const block = await provider.getBlock("latest");
      setLastMessageTime(block.timestamp);

      setTimeout(() => {
        fetchAllMessages();
      }, 3000);
    } catch (e) {
      console.error("Error sending message:", e);

      let errorMessage = "Transaction failed. See console for details.";
      if (e.message && e.message.includes("CoOLDOWN_TIME")) {
        errorMessage =
          "Cooldown active. You must wait 30 seconds between messages.";
      } else if (e.message && e.message.includes("Message is too long")) {
        errorMessage = "Message too long (Max 280 chars).";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
      setTimeout(() => {
        setSuccessMessage(null);
        setError(null);
      }, 5000);
    }
  };

  const checkCooldown = useCallback(async () => {
    if (!currentAccount) return;
    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const hambaContract = getContract(provider);

      const lastTimeBigInt = await hambaContract.lastMessageTime(
        currentAccount
      );
      const lastTime = Number(lastTimeBigInt);
      setLastMessageTime(lastTime);
    } catch (e) {
      console.error("Error checking cooldown:", e);
    }
  }, [currentAccount, getContract]);

  useEffect(() => {
    const checkIfWalletIsConnected = async () => {
      try {
        if (typeof window.ethereum === "undefined") {
          setError("MetaMask not detected.");
          return;
        }

        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts.length > 0) {
          setCurrentAccount(accounts[0]);
        }

        await fetchAllMessages();

        window.ethereum.on("accountsChanged", (newAccounts) => {
          setCurrentAccount(newAccounts.length > 0 ? newAccounts[0] : null);
          setMessages([]);
        });
      } catch (e) {
        console.error("Setup error:", e);
        setError("Initial setup failed. Check connection.");
      }
    };
    checkIfWalletIsConnected();
  }, [fetchAllMessages]);

  useEffect(() => {
    if (currentAccount) {
      fetchAllMessages();
      checkCooldown();
    }
  }, [currentAccount, fetchAllMessages, checkCooldown]);

  const now = Math.floor(Date.now() / 1000);
  const timeElapsed = now - lastMessageTime;
  const timeRemaining = COOLDOWN_SECONDS - timeElapsed;
  const isOnCooldown = lastMessageTime > 0 && timeRemaining > 0;

  const formattedTimeRemaining =
    timeRemaining > 0 ? `${Math.ceil(timeRemaining)}s` : "Ready";

  const ConnectButton = () => (
    <button
      onClick={connectWallet}
      disabled={loading}
      className="group relative w-full md:w-auto px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl shadow-2xl hover:shadow-cyan-500/30 hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white relative z-10"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span className="relative z-10">Connecting...</span>
        </>
      ) : (
        <>
          <span className="relative z-10">Connect Wallet</span>
          <svg
            className="ml-3 relative z-10 w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            ></path>
          </svg>
        </>
      )}
    </button>
  );

  const MessageForm = () => (
    <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700 transition-all duration-300 hover:shadow-cyan-500/20">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-t-2xl"></div>
      <h2 className="text-2xl font-bold text-white mb-4 pb-4 border-b border-gray-700 flex items-center">
        <svg
          className="w-6 h-6 mr-2 text-cyan-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          ></path>
        </svg>
        Send a Message (Max 280 Chars)
      </h2>

      {currentAccount && (
        <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 to-cyan-400 mr-3 animate-pulse"></div>
              <p className="text-sm font-medium text-gray-300">
                Connected as:{" "}
                <span className="text-cyan-300 font-mono font-bold">
                  {formatAddress(currentAccount)}
                </span>
              </p>
            </div>
            <div className="flex items-center">
              <div
                className={`px-4 py-2 rounded-full font-bold transition-all duration-300 ${
                  isOnCooldown
                    ? "bg-gradient-to-r from-red-900/30 to-red-800/30 text-red-300 border border-red-700/50"
                    : "bg-gradient-to-r from-green-900/30 to-emerald-800/30 text-emerald-300 border border-emerald-700/50"
                }`}
              >
                <div className="flex items-center">
                  <svg
                    className={`w-4 h-4 mr-2 ${
                      isOnCooldown ? "animate-spin" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d={
                        isOnCooldown
                          ? "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          : "M13 10V3L4 14h7v7l9-11h-7z"
                      }
                    ></path>
                  </svg>
                  {formattedTimeRemaining}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={sendHambaMessage} className="space-y-4">
        <div className="relative">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              currentAccount
                ? "Type your message to the blockchain..."
                : "Connect wallet to send messages..."
            }
            maxLength="280"
            rows="4"
            disabled={loading || isOnCooldown || !currentAccount}
            className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-300 disabled:opacity-50 resize-none backdrop-blur-sm"
          />
          <div className="absolute bottom-3 right-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-cyan-300">
                {newMessage.length}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            Characters: {newMessage.length}/280
          </p>
          <button
            type="submit"
            disabled={
              loading ||
              isOnCooldown ||
              newMessage.trim().length === 0 ||
              !currentAccount
            }
            className="group relative w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-cyan-500/30 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
            {loading ? (
              <div className="flex items-center justify-center relative z-10">
                <svg
                  className="animate-spin h-5 w-5 mr-3"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </div>
            ) : (
              <div className="flex items-center justify-center relative z-10">
                <span>Broadcast Message</span>
                <svg
                  className="ml-2 w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  ></path>
                </svg>
              </div>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  const MessageList = () => (
    <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-600 rounded-t-2xl"></div>
      <h2 className="text-2xl font-bold text-white mb-4 pb-4 border-b border-gray-700 flex justify-between items-center">
        <div className="flex items-center">
          <svg
            className="w-6 h-6 mr-2 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            ></path>
          </svg>
          Message History
        </div>
        <button
          onClick={fetchAllMessages}
          className="group text-sm bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-300 hover:text-white px-4 py-2 rounded-lg border border-purple-700/50 hover:border-purple-500 transition-all duration-300 disabled:opacity-50 flex items-center"
          disabled={loading}
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4 mr-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Refreshing...
            </>
          ) : (
            <>
              Refresh
              <svg
                className="ml-2 w-4 h-4 group-hover:rotate-180 transition-transform duration-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                ></path>
              </svg>
            </>
          )}
        </button>
      </h2>

      {messages.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-6 opacity-20">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              ></path>
            </svg>
          </div>
          <p className="text-gray-400 text-lg mb-2">The portal is quiet...</p>
          <p className="text-gray-500">Be the first to send a message!</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-5 rounded-xl transition-all duration-300 border ${
                message.sender.toLowerCase() === currentAccount?.toLowerCase()
                  ? "bg-gradient-to-r from-cyan-900/20 to-cyan-800/10 border-cyan-700/30 shadow-lg shadow-cyan-500/10"
                  : "bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
                <div className="flex items-center">
                  <div
                    className={`w-2 h-2 rounded-full mr-3 ${
                      message.sender.toLowerCase() ===
                      currentAccount?.toLowerCase()
                        ? "bg-gradient-to-r from-cyan-400 to-cyan-300 animate-pulse"
                        : "bg-gradient-to-r from-purple-400 to-pink-300"
                    }`}
                  ></div>
                  <div>
                    <p className="font-bold text-sm">
                      {message.sender.toLowerCase() ===
                      currentAccount?.toLowerCase() ? (
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-200">
                          👤 You
                        </span>
                      ) : (
                        <span className="text-gray-300">
                          {formatAddress(message.sender)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {message.sender}
                    </p>
                  </div>
                </div>
                <div className="flex items-center px-3 py-1 bg-gray-900/50 rounded-full border border-gray-700/50">
                  <svg
                    className="w-3 h-3 mr-2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                  <p className="text-xs text-gray-400">
                    {new Date(message.timestamp * 1000).toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="text-gray-200 leading-relaxed break-words whitespace-pre-wrap pl-5 border-l-2 border-cyan-500/30">
                {message.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 py-10 px-4 sm:px-6 lg:px-8 font-[Inter]">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-4xl mx-auto relative">
        {/* Header */}
        <header className="text-center mb-10 relative">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-cyan-500/20 to-purple-600/20 rounded-2xl flex items-center justify-center shadow-2xl shadow-cyan-500/10 border border-cyan-500/20">
              <span className="text-4xl">🐮</span>
            </div>
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
              Hambareum
            </h1>
            <p className="text-xl text-gray-400 font-light">
              The Only One Global Decentralized Message Board
            </p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
            {currentAccount ? (
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-400 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-300"></div>
                <div className="relative px-6 py-3 bg-gray-900 rounded-xl border border-emerald-700/50">
                  <p className="text-emerald-300 font-medium flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-3 animate-pulse"></span>
                    Connected:{" "}
                    <span className="font-mono ml-2 text-emerald-200">
                      {formatAddress(currentAccount)}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <ConnectButton />
            )}
            <div className="px-4 py-3 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700/50">
              <p className="text-xs font-mono text-gray-400">
                Contract:{" "}
                <span className="text-cyan-300">
                  {formatAddress(CONTRACT_ADDRESS)}
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* Status Messages */}
        <div className="mb-8 space-y-4">
          {error && (
            <div className="relative p-4 bg-gradient-to-r from-red-900/30 to-red-800/20 border border-red-700/50 rounded-xl backdrop-blur-sm">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-red-900/50 flex items-center justify-center mr-3">
                  <svg
                    className="w-5 h-5 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                <div>
                  <strong className="font-bold text-red-300">Error </strong>
                  <span className="text-red-200 block sm:inline">{error}</span>
                </div>
              </div>
            </div>
          )}
          {successMessage && (
            <div className="relative p-4 bg-gradient-to-r from-emerald-900/30 to-green-800/20 border border-emerald-700/50 rounded-xl backdrop-blur-sm">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center mr-3">
                  <svg
                    className="w-5 h-5 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div>
                  <strong className="font-bold text-emerald-300">
                    Success!{" "}
                  </strong>
                  <span className="text-emerald-200 block sm:inline">
                    {successMessage}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8">
          <MessageForm />
          <MessageList />
        </div>

        <footer className="mt-12 pt-8 border-t border-gray-800 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500">
            <p>Hamba Portal DApp • Decentralized Communication</p>
            <div className="flex items-center mt-2 sm:mt-0">
              <svg
                className="w-4 h-4 mr-2 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <p>
                Cooldown:{" "}
                <span className="text-cyan-300 font-bold">
                  {COOLDOWN_SECONDS}s
                </span>
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-600">
            Built with React • Ethers.js • Web3 Technology
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
