// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract Voting {
    enum WorkflowStatus { RegisteringVoters, CommitPhase, RevealPhase, Finished }

    struct Election {
        string title;
        string[] candidates;
        address creator;
        uint[] votes;
        WorkflowStatus status;  
        uint totalCommits;      
        uint revealedCount;     
        mapping(address => bytes32) commits;     
        mapping(address => bool) hasVoted;      
        mapping(address => bool) hasRevealed;   
    }

    uint public electionCount;
    mapping(uint => Election) private elections;

    event ElectionCreated(uint indexed electionId, string title, address indexed creator);
    event WorkflowStatusChange(uint indexed electionId, WorkflowStatus previousStatus, WorkflowStatus newStatus);
    event VoteCommitted(uint indexed electionId, address indexed voter);
    event VoteRevealed(uint indexed electionId, address indexed voter, uint optionIndex);
    event ElectionClosed(uint indexed electionId, address indexed closer);

    function createElection(string memory _title, string[] memory _candidates) public {
        require(_candidates.length > 1, "Se necesitan al menos dos candidatos");

        Election storage newElection = elections[electionCount];
        newElection.title = _title;
        newElection.candidates = _candidates;
        newElection.creator = msg.sender;
        newElection.status = WorkflowStatus.RegisteringVoters; // Fase 0
        newElection.votes = new uint[](_candidates.length);

        emit ElectionCreated(electionCount, _title, msg.sender);
        electionCount++;
    }

    function advanceWorkflowStatus(uint _electionId) public {
        Election storage election = elections[_electionId];
        require(msg.sender == election.creator, "Solo el admin cambia de fase");
        require(election.status != WorkflowStatus.Finished, "La eleccion ya ha terminado");

        WorkflowStatus oldStatus = election.status;
        election.status = WorkflowStatus(uint(oldStatus) + 1);

        emit WorkflowStatusChange(_electionId, oldStatus, election.status);
        
        if (election.status == WorkflowStatus.Finished) {
            emit ElectionClosed(_electionId, msg.sender);
        }
    }

    function vote(uint _electionId, bytes32 _commitHash) public {
        Election storage election = elections[_electionId];

        require(election.status == WorkflowStatus.CommitPhase, "No estamos en fase de votacion (Commit)");
        require(!election.hasVoted[msg.sender], "Ya has votado");

        election.commits[msg.sender] = _commitHash;
        election.hasVoted[msg.sender] = true; 
        election.totalCommits++;

        emit VoteCommitted(_electionId, msg.sender);
    }

    function revealVote(uint _electionId, uint _candidateIndex, string memory _salt) public {
    Election storage election = elections[_electionId];

    require(election.status == WorkflowStatus.RevealPhase, "No estamos en fase de recuento");
    require(election.hasVoted[msg.sender], "No has registrado ningun voto");
    require(!election.hasRevealed[msg.sender], "Ya has revelado tu voto");
    
    require(_candidateIndex < election.candidates.length, "ERROR CRITICO: El indice del candidato se sale del array de la Blockchain");

    bytes32 expectedCommit = keccak256(abi.encodePacked(_candidateIndex, _salt));
    require(expectedCommit == election.commits[msg.sender], "El voto o el secreto no coinciden");

    election.votes[_candidateIndex]++; 
    election.revealedCount++;
    election.hasRevealed[msg.sender] = true;

    emit VoteRevealed(_electionId, msg.sender, _candidateIndex);

    if (election.revealedCount == election.totalCommits) {
        election.status = WorkflowStatus.Finished;
        emit ElectionClosed(_electionId, election.creator);
    }
}

    function getResults(uint _electionId) public view returns (uint[] memory) {
        return elections[_electionId].votes;
    }

    function getCandidates(uint _electionId) public view returns (string[] memory) {
        return elections[_electionId].candidates;
    }

    function hasUserVoted(uint _electionId, address _user) public view returns (bool) {
        return elections[_electionId].hasVoted[_user];
    }

    function isActive(uint _electionId) public view returns (bool) {
        return elections[_electionId].status != WorkflowStatus.Finished;
    }

    function hasUserRevealed(uint _electionId, address _user) public view returns (bool) {
        return elections[_electionId].hasRevealed[_user];
    }

    function getWorkflowStatus(uint _electionId) public view returns (uint) {
        return uint(elections[_electionId].status);
    }

function getElectionDetails(uint _electionId) public view returns (
    uint totalCommits, 
    uint revealedCount
) {
    Election storage e = elections[_electionId];
    return (e.totalCommits, e.revealedCount);
}
}