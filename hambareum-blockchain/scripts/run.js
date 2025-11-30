const { ethers } = require("hardhat");

const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

const main = async () => {
  const [owner, user1, user2] = await ethers.getSigners();

  console.log("--- 1. Deployment ---");
  const HambaContractFactory = await ethers.getContractFactory("HambaPortal");
  const hambaContract = await HambaContractFactory.deploy();
  await hambaContract.waitForDeployment();
  const contractAddress = await hambaContract.getAddress();
  console.log("Contract deployed to:", contractAddress);
  console.log(`\nOwner (cooldown test base): ${owner.address}`);
  console.log(`User 1: ${user1.address}`);
  console.log(`User 2: ${user2.address}`);

  console.log("\n--- 2. Sending Initial Messages ---");

  // Message 1 (Owner)
  let tx = await hambaContract.sendMessage(
    "Hello Hamba! This is the first message."
  );
  await tx.wait();
  console.log(
    `[Sent] Message 1 from Owner: "Hello Hamba! This is the first message."`
  );

  // Message 2 (User 1)
  const hambaUser1 = hambaContract.connect(user1);
  tx = await hambaUser1.sendMessage(
    "User1 reporting for duty! Global chat is cool."
  );
  await tx.wait();
  console.log(
    `[Sent] Message 2 from User 1: "User1 reporting for duty! Global chat is cool."`
  );

  console.log("\n--- 3. Cooldown Test (30 seconds) ---");

  try {
    console.log("Attempting to send Message 3 from Owner immediately...");
    tx = await hambaContract.sendMessage(
      "This message should fail the cooldown."
    );
    await tx.wait();
  } catch (error) {
    console.log(
      `[Failed] Cooldown check successfully prevented immediate message.`
    );
  }

  console.log(`\nSimulating time passing... Increasing time by 31 seconds.`);
  await increaseTime(31);

  tx = await hambaContract.sendMessage(
    "This is the Owner's second message, after cooldown."
  );
  await tx.wait();
  console.log(
    `[Sent] Message 3 from Owner: "This is the Owner's second message, after cooldown."`
  );

  console.log("\n--- 4. Fetching All Messages ---");
  const allMessages = await hambaContract.getAllMessages();

  if (allMessages.length === 0) {
    console.log("The message history is empty.");
    return;
  }

  console.log(`Total messages retrieved: ${allMessages.length}`);
  console.log("-----------------------------------------");

  allMessages.forEach((message, index) => {
    const timestamp = Number(message.timestamp);
    const date = new Date(timestamp * 1000).toLocaleTimeString("en-US");

    console.log(`Message #${index + 1}`);
    console.log(`  Sender: ${message.sender}`);
    console.log(`  Time: ${date} (Block Timestamp: ${timestamp})`);
    console.log(`  Content: "${message.content}"`);
    console.log("-----------------------------------------");
  });
};

const runMain = async () => {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
  }
};

runMain();
