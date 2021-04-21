import { createElement } from 'rax';
import { useState } from 'rax-app';

function Count() {
  const [count, setCount] = useState(0);
  const inc = () => setCount(count + 1);

  return (
    <view className="count">
      <text className="number" onClick={inc}>
        You have clicked {count} times...
      </text>
    </view>
  );
}

export default Count;
