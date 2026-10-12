import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; label: string; onReset?: () => void };

// กันไม่ให้ส่วนหนึ่งพังแล้วทั้งแอปเป็นจอขาว: แสดงข้อความแทนส่วนที่พัง พร้อมปุ่มลองใหม่
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <div className="panel">
          <p className="error">
            {this.props.label}มีปัญหา: {this.state.error.message}
          </p>
          <button
            className="primary"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }
}
