import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from collections import deque

class QNetwork(nn.Module):
    """Deep Q-Network for Microgrid Battery Dispatch Policy."""
    def __init__(self, state_dim: int = 6, action_dim: int = 5):
        super(QNetwork, self).__init__()
        self.fc = nn.Sequential(
            nn.Linear(state_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Linear(64, action_dim)
        )

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        return self.fc(state)


class ReplayBuffer:
    """Experience Replay Buffer for Q-Learning."""
    def __init__(self, capacity: int = 10000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int):
        state, action, reward, next_state, done = zip(*random.sample(self.buffer, batch_size))
        return (
            torch.FloatTensor(np.array(state)),
            torch.LongTensor(action),
            torch.FloatTensor(reward),
            torch.FloatTensor(np.array(next_state)),
            torch.FloatTensor(done)
        )

    def __len__(self):
        return len(self.buffer)


class DQNAgent:
    def __init__(self, state_dim: int = 6, action_dim: int = 5, lr: float = 1e-3, gamma: float = 0.99):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.gamma = gamma
        self.epsilon = 1.0
        self.epsilon_min = 0.05
        self.epsilon_decay = 0.995

        self.policy_net = QNetwork(state_dim, action_dim)
        self.target_net = QNetwork(state_dim, action_dim)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()

        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=lr)
        self.memory = ReplayBuffer(capacity=5000)

    def select_action(self, state: np.ndarray, evaluate: bool = False) -> int:
        if not evaluate and random.random() < self.epsilon:
            return random.randint(0, self.action_dim - 1)
        
        state_t = torch.FloatTensor(state).unsqueeze(0)
        with torch.no_grad():
            q_values = self.policy_net(state_t)
        return int(torch.argmax(q_values, dim=1).item())

    def update(self, batch_size: int = 32):
        if len(self.memory) < batch_size:
            return

        states, actions, rewards, next_states, dones = self.memory.sample(batch_size)

        # Current Q values
        q_values = self.policy_net(states)
        state_action_values = q_values.gather(1, actions.unsqueeze(1)).squeeze(1)

        # Target Q values using Target Network
        with torch.no_grad():
            next_q_values = self.target_net(next_states).max(1)[0]
            expected_state_action_values = rewards + (self.gamma * next_q_values * (1 - dones))

        # MSE Loss
        loss = nn.MSELoss()(state_action_values, expected_state_action_values)

        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        # Epsilon decay
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

    def update_target_network(self):
        self.target_net.load_state_dict(self.policy_net.state_dict())


def train_dqn_agent(env, episodes: int = 50) -> DQNAgent:
    """Train the PyTorch DQN agent on the Microgrid environment."""
    agent = DQNAgent(state_dim=6, action_dim=5)
    
    print(f"Training PyTorch DQN Agent for {episodes} episodes...")
    for ep in range(episodes):
        state, _ = env.reset()
        ep_reward = 0.0
        done = False
        
        while not done:
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            
            agent.memory.push(state, action, reward, next_state, float(done))
            agent.update(batch_size=32)
            
            state = next_state
            ep_reward += reward
            
        if (ep + 1) % 10 == 0:
            agent.update_target_network()
            print(f"Episode {ep + 1}/{episodes} - Reward: {ep_reward:.2f} - Epsilon: {agent.epsilon:.3f}")
            
    agent.epsilon = 0.0 # Set to greedy for deployment
    return agent
