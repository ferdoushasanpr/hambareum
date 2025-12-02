import React, { useState, useEffect, useCallback } from "react";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const COOLDOWN_SECONDS = 30;

const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "_message", type: "string" }],
    name: "sendMessage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllMessages",
    outputs: [
      {
        components: [
          { internalType: "address", name: "sender", type: "address" },
          { internalType: "string", name: "content", type: "string" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
        ],
        internalType: "struct HambaPortal.Message[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "content",
        type: "string",
      },
    ],
    name: "NewMessage",
    type: "event",
  },
];

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

  // Memoized function to get the contract instance
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

  // 1. Fetch all messages from the blockchain
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

      // Format messages and sort by timestamp (newest first)
      const formattedMessages = allMessages
        .map((message) => ({
          sender: message.sender,
          content: message.content,
          timestamp: Number(message.timestamp),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setMessages(formattedMessages);
      console.log("Messages fetched:", formattedMessages.length);
    } catch (e) {
      console.error("Error fetching messages:", e);
      setError("Failed to fetch messages. Check console for details.");
    }
  }, [getContract]);

  // 2. Connect Wallet
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
        console.log("Connected:", accounts[0]);
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

  // 3. Send Message
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

      console.log("Sending message:", newMessage);
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

  // 4. Check Cooldown Status
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

  // 5. Initial setup and event listeners
  useEffect(() => {
    // A. Check for Ethereum provider
    const checkIfWalletIsConnected = async () => {
      try {
        if (typeof window.ethereum === "undefined") {
          setError("MetaMask not detected.");
          return;
        }

        // Check if we're already authorized
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts.length > 0) {
          setCurrentAccount(accounts[0]);
          console.log("Found authorized account:", accounts[0]);
        }

        // B. Fetch messages initially
        await fetchAllMessages();

        // C. Set up listener for account changes
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

  // Refetch messages and cooldown whenever account changes
  useEffect(() => {
    if (currentAccount) {
      fetchAllMessages();
      checkCooldown();
    }
  }, [currentAccount, fetchAllMessages, checkCooldown]);

  // Cooldown calculation for UI
  const now = Math.floor(Date.now() / 1000);
  const timeElapsed = now - lastMessageTime;
  const timeRemaining = COOLDOWN_SECONDS - timeElapsed;
  const isOnCooldown = lastMessageTime > 0 && timeRemaining > 0;

  const formattedTimeRemaining =
    timeRemaining > 0 ? `${Math.ceil(timeRemaining)}s` : "Ready";

  // --- UI Components ---

  const ConnectButton = () => (
    <button
      onClick={connectWallet}
      disabled={loading}
      className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition duration-150 disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center"
    >
      {loading ? (
        <svg
          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
      ) : (
        "Connect Wallet"
      )}
    </button>
  );

  const MessageForm = () => (
    <div className="bg-white p-6 rounded-xl shadow-2xl transition duration-300 hover:shadow-indigo-300">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">
        Send a Message (Max 280 Chars)
      </h2>

      {currentAccount && (
        <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 rounded-lg border">
          <p className="text-sm font-medium text-gray-600">
            Current Sender:{" "}
            <span className="text-indigo-600 font-mono">
              {formatAddress(currentAccount)}
            </span>
          </p>
          <div
            className={`text-sm font-bold px-3 py-1 rounded-full ${
              isOnCooldown
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-600"
            }`}
          >
            Cooldown: {formattedTimeRemaining}
          </div>
        </div>
      )}

      <form onSubmit={sendHambaMessage} className="space-y-4">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={
            currentAccount
              ? "What's on your mind?..."
              : "Connect wallet to start typing..."
          }
          maxLength="280"
          rows="4"
          disabled={loading || isOnCooldown || !currentAccount}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 disabled:bg-gray-100 resize-none"
        />
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{newMessage.length} / 280</p>
          <button
            type="submit"
            disabled={
              loading ||
              isOnCooldown ||
              newMessage.trim().length === 0 ||
              !currentAccount
            }
            className="px-6 py-2 bg-pink-500 text-white font-semibold rounded-lg shadow-md hover:bg-pink-600 transition duration-150 disabled:bg-pink-300 disabled:cursor-not-allowed flex items-center"
          >
            {loading ? (
              <>
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
              </>
            ) : (
              "Post Message"
            )}
          </button>
        </div>
      </form>
    </div>
  );

  const MessageList = () => (
    <div className="bg-white p-6 rounded-xl shadow-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2 flex justify-between items-center">
        Message History
        <button
          onClick={fetchAllMessages}
          className="text-sm text-indigo-600 hover:text-indigo-800 transition duration-150 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </h2>

      {messages.length === 0 ? (
        <p className="text-center text-gray-500 py-10">
          No messages found on the portal yet. Be the first to post!
        </p>
      ) : (
        <ul className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {messages.map((message, index) => (
            <li
              key={index}
              className={`p-4 rounded-lg shadow-md transition duration-200 ${
                message.sender.toLowerCase() === currentAccount?.toLowerCase()
                  ? "bg-indigo-50 border-2 border-indigo-200"
                  : "bg-gray-50 border border-gray-200"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold text-sm text-gray-800 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></span>
                  {message.sender.toLowerCase() ===
                  currentAccount?.toLowerCase() ? (
                    <span className="text-indigo-600 font-bold">
                      You ({formatAddress(message.sender)})
                    </span>
                  ) : (
                    <span className="font-mono text-gray-700">
                      {formatAddress(message.sender)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(message.timestamp * 1000).toLocaleString()}
                </p>
              </div>
              <p className="text-gray-900 leading-relaxed break-words whitespace-pre-wrap">
                {message.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8 font-[Inter]">
      <div className="max-w-4xl mx-auto">
        {/* Header and Status */}
        <header className="text-center mb-10">
          <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight mb-2">
            Hamba Portal 🚀
          </h1>
          <p className="text-xl text-indigo-600 font-medium">
            Decentralized Message Board on Ethereum
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {currentAccount ? (
              <p className="text-sm font-medium text-green-700 bg-green-100 px-4 py-2 rounded-full shadow">
                Wallet Connected:{" "}
                <span className="font-mono">
                  {formatAddress(currentAccount)}
                </span>
              </p>
            ) : (
              <ConnectButton />
            )}
            <p className="text-xs font-mono text-gray-500 bg-gray-100 p-2 rounded-lg border">
              Contract: {formatAddress(CONTRACT_ADDRESS)}
            </p>
          </div>
        </header>

        {/* Status Messages */}
        <div className="mb-6 space-y-3">
          {error && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative shadow-md"
              role="alert"
            >
              <strong className="font-bold">Error! </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          {successMessage && (
            <div
              className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative shadow-md"
              role="alert"
            >
              <strong className="font-bold">Success! </strong>
              <span className="block sm:inline">{successMessage}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Send Message Card */}
          <MessageForm />

          {/* Message List Card */}
          <MessageList />
        </div>

        <footer className="mt-10 pt-6 border-t border-gray-300 text-center text-sm text-gray-500">
          <p>Hamba Portal Dapp | Cooldown: {COOLDOWN_SECONDS} seconds</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
