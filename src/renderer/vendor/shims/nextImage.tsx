import type { CSSProperties, ImgHTMLAttributes } from 'react';

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
};

export default function NextImage({
  src,
  alt,
  fill,
  width,
  height,
  style,
  ...rest
}: NextImageProps) {
  const resolvedStyle: CSSProperties = fill
    ? {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...style,
      }
    : {
        width,
        height,
        ...style,
      };

  return <img src={src} alt={alt} width={width} height={height} style={resolvedStyle} {...rest} />;
}
