import { createElement } from 'rax';
import Logo from '../../components/Logo';
import { isObject } from '../../utils';

export default function Home(props) {
  const { history } = props;

  if (!isObject(props)) {
    console.log('home page props ===>', props);
  }

  return (
    <view className="home">
      <Logo />
      <text className="title">{props?.data?.title || 'Welcome to Your Rax App'}</text>
      <text className="info" onClick={() => history.push('/about', { id: 1 })}>Go About</text>
    </view>
  );
}
