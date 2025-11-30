// SPDX-License-Identifier: UNLICENSED 
pragma solidity ^0.8.0;

contract HambaPortal {
    struct Message {
        address sender;
        string content;
        uint timestamp;
    }

    Message[] public messages;

    mapping(address => uint) public lastMessageTime;

    uint public constant COOLDOWN_TIME = 30 seconds;

    event NewMessage(
        address indexed from, // The sender's address (indexed for easy filtering)
        uint timestamp,
        string content
    );

    function sendMessage(string calldata _message) public {
        require(
            block.timestamp >= lastMessageTime[msg.sender] + COOLDOWN_TIME,
            "Please wait before sending another message. Cooldown is 30 seconds."
        );

        uint messageLength = bytes(_message).length;
        require(messageLength > 0, "Message cannot be empty.");
        require(messageLength <= 280, "Message is too long (Max 280 chars).");

        lastMessageTime[msg.sender] = block.timestamp;

        messages.push(Message(
            msg.sender,
            _message,
            block.timestamp
        ));

        emit NewMessage(msg.sender, block.timestamp, _message);
    }
    function getAllMessages() public view returns (Message[] memory) {
        return messages;
    }
}