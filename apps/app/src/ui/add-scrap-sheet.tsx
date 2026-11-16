// The library's + button and the sheet it opens for saving a pasted link.
// (Most links arrive through the share sheet; this is for everything else.)
import { saveScrap } from '@fwdme/core';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Button, Field, Message, NewScrapVisibilityPicker, usePalette, type VisibilityChoice } from '@/ui/components';

export function AddScrapButton({ onSaved }: { onSaved: (alreadySaved: boolean) => void }) {
  const { t } = useI18n();
  const c = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('saveLink')}
        onPress={() => setOpen(true)}
        className="absolute bottom-5 end-5 h-14 w-14 items-center justify-center rounded-full bg-accent"
        style={({ pressed }) => ({
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        })}
      >
        <Plus size={28} color={c.accentText} strokeWidth={2.4} />
      </Pressable>
      <AddScrapSheet
        visible={open}
        onClose={() => setOpen(false)}
        onSaved={(alreadySaved) => {
          setOpen(false);
          onSaved(alreadySaved);
        }}
      />
    </>
  );
}

function AddScrapSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (alreadySaved: boolean) => void;
}) {
  const { t, errorText } = useI18n();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState('');
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<VisibilityChoice>('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLink('');
    setComment('');
    setVisibility('default');
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveScrap(supabase, {
        input: link,
        comment,
        visibility: visibility === 'default' ? null : visibility,
      });
      reset();
      onSaved(result.alreadySaved);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
        <Pressable accessibilityLabel={t('close')} onPress={close} className="absolute inset-0 bg-black/40" />
        <View
          className="w-full max-w-[560px] self-center gap-3 rounded-t-3xl bg-surface px-5 pt-3"
          style={{ paddingBottom: 20 + insets.bottom }}
        >
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <View className="flex-row items-center justify-between">
            <Text className="text-[19px] font-bold text-text">{t('saveLink')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              onPress={close}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface-2"
            >
              <X size={18} color={c.muted} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Field
            value={link}
            onChangeText={setLink}
            placeholder={t('pasteLink')}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            keyboardType="url"
            onSubmitEditing={() => link.trim() && submit()}
            accessibilityLabel={t('pasteLink')}
          />
          <Field
            value={comment}
            onChangeText={setComment}
            placeholder={t('addComment')}
            multiline
            accessibilityLabel={t('addComment')}
          />
          <NewScrapVisibilityPicker value={visibility} onChange={setVisibility} />
          <Message text={error} />
          <Button title={t('save')} onPress={submit} busy={busy} disabled={!link.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
