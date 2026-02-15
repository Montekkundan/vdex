import {
  GitForkIcon,
  HeadsetIcon,
  MessageSquareIcon,
  SquareTerminal,
  UserSearch,
} from "lucide-react";

type IconProps = React.HTMLAttributes<SVGElement>;

export const Icons = {
  logo: (props: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" x2="20" y1="19" y2="19"></line>
    </svg>
  ),
  github: (props: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M12 2a10 10 0 0 0-3.162 19.487c.5.093.683-.216.683-.48 0-.236-.009-.862-.013-1.692-2.782.604-3.37-1.341-3.37-1.341-.455-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.004.071 1.532 1.03 1.532 1.03.892 1.529 2.341 1.087 2.91.831.091-.646.349-1.087.635-1.337-2.221-.253-4.556-1.111-4.556-4.944 0-1.092.39-1.986 1.03-2.685-.103-.253-.447-1.272.098-2.651 0 0 .84-.269 2.75 1.025a9.58 9.58 0 0 1 5.004 0c1.91-1.294 2.749-1.025 2.749-1.025.546 1.379.202 2.398.1 2.651.64.699 1.029 1.593 1.029 2.685 0 3.842-2.339 4.688-4.567 4.936.359.309.679.919.679 1.852 0 1.338-.012 2.419-.012 2.748 0 .266.18.577.688.479A10 10 0 0 0 12 2Z" />
    </svg>
  ),
  twitter: (props: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M18.901 1.153h3.68l-8.036 9.187L24 22.847h-7.406l-5.8-7.584-6.632 7.584H.479l8.596-9.826L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.494h2.039L6.485 3.24H4.298l13.313 17.407Z" />
    </svg>
  ),
  streamHeadset: (props: IconProps) => <HeadsetIcon {...props} />,
  streamTerminal: (props: IconProps) => <SquareTerminal {...props} />,
  streamSearch: (props: IconProps) => <UserSearch {...props} />,
  streamMessage: (props: IconProps) => <MessageSquareIcon {...props} />,
  streamFork: (props: IconProps) => <GitForkIcon {...props} />,
};
