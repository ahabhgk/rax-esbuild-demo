import { createElement, Component } from 'rax';
import raxImg from '../assets/rax.png';

class Logo extends Component {
  render() {
    return <image className="logo" src={raxImg} />;
  }
}

export default Logo;
